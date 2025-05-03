import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { watch } from "chokidar";
import { RequestListener, RequestSender } from "process-request";
import "../utils/BigInt.js";
import {
	env,
	log,
	Packages,
	setNodePath
} from "#utils";


if (process.env.IS_ENTRYPOINT) {
	process.env.WATCH = true;
	if (!process.env.IS_ENTRYPOINT_TARGET) {
		process.env.npm_lifecycle_event = "build";
		const devIndex = process.argv.indexOf("--dev");
		if (~devIndex)
			process.argv.splice(devIndex, 1);
		delete process.env.DEV;
		if (!process.env.FORCE) {
			const buildIndex = process.argv.indexOf("--build");
			if (~buildIndex)
				process.argv.splice(buildIndex, 1);
			const bundleIndex = process.argv.indexOf("--bundle");
			if (~bundleIndex)
				process.argv.splice(bundleIndex, 1);
			delete process.env.BUILD;
			delete process.env.BUNDLE;
		}
	}
} else
	setNodePath();

env();

if (process.env.npm_lifecycle_event === "dev" || process.argv.includes("--dev")) {
	process.env.DEV = true;
	process.env.WATCH = true;
}
if (process.env.npm_lifecycle_event === "build" || process.argv.includes("--build"))
	process.env.BUILD = true;
if (process.argv.includes("--bundle"))
	process.env.BUNDLE = true;

const { NODE_ENV, WATCH, IS_ENTRYPOINT } = process.env;

const stagesFlatDepth = 3;


export class Conveyer {
	constructor(stages, options = {}) {
		const {
			initialCleanup,
			...restOptions
		} = options;
		
		this.name = path.basename(process.argv[1]).replace(/.conveyer(.(?:[cm]?j|t)s)?$/, "").replace(/^\./, "");
		
		this.options = {
			context: this.context,
			initialCleanup:
				initialCleanup ?
					(
						Array.isArray(initialCleanup) ?
							initialCleanup :
							[ initialCleanup ]
					).filter(Boolean) :
					false,
			...restOptions
		};
		
		this.isEntrypoint = !!IS_ENTRYPOINT;
		
		if (WATCH)
			this.watchers.push(watch("package.json", {
				ignoreInitial: true,
				awaitWriteFinish: {
					stabilityThreshold: 500,
					pollInterval: 50
				}
			}).on("all", this.#handlePackageJSONChange));
		
		let i = 1;
		for (const stage of stages.flat(stagesFlatDepth))
			if (stage) {
				if (!stage.title)
					stage.title = stage.constructor.name;
				
				if (!stage.id)
					stage.id = stage.title.toLowerCase().replaceAll(/\W/g, "");
				
				while (this.stages.has(stage.id))
					stage.id += i;
				
				this.stages.set(stage.id, stage);
				stage.conveyer = this;
				stage.context =
					stage.conveyer.context[stage.id] =
						{ stage: stage.constructor.name };
				
				i++;
			}
		
		process.on("exit", code => this.exit(code));
		process.on("SIGINT", () => this.exit("SIGINT"));
		process.on("SIGTERM", () => this.exit("SIGTERM"));
		
		if (this.isEntrypoint) {
			this.requestSender = new RequestSender(process);
			new RequestListener(process, method => this[method]());
		}
		
		this.#handlePackageJSONChange()
			.then(() => this.init());
		
	}
	
	stages = new Map();
	
	context = {
		conveyerVersion: JSON.parse(readFileSync(path.join(Packages.getClosestPackageDir(fileURLToPath(import.meta.url)), "package.json"))).version
	};
	
	watchers = [];
	
	#handlePackageJSONChange = async () => {
		
		const packageJSON = JSON.parse(await readFile("package.json", "utf8"));
		
		this.title = `${packageJSON.name}${this.name ? `/${this.name}` : ""}`;
		this.version = packageJSON.version;
		
		this.context.packageJSON = packageJSON;
		
	};
	
	async init() {
		
		if (this.isEntrypoint)
			this.requestSender.send("init", this.options, NODE_ENV);
		else {
			this.initAt = Date.now();
			await log.progress({ symbol: "🌀", title: `${chalk.bold(this.title)} ${this.version} ${chalk.dim(NODE_ENV)}` });
		}
		
		for (const stage of this.stages.values())
			await stage.handleInited();
		
		if (this.isEntrypoint) {
			this.requestSender.send("inited");
			
			return null;
		}
		
		log.finish();
		
		return this.run();
		
	}
	
	logFinish(props) {
		return this.isEntrypoint ? this.requestSender.send("logFinish", props) : log.finish(props);
	}
	
	beginStage(props) {
		return this.isEntrypoint ? this.requestSender.send("beginStage", props) : log.progress(props);
	}
	
	doneStage(props) {
		return this.isEntrypoint ? this.requestSender.send("doneStage", props) : log.finish(props);
	}
	
	async run() {
		
		if (this.options.initialCleanup)
			for (const dir of this.options.initialCleanup)
				if (existsSync(dir))
					await Promise.all((await readdir(dir)).map(file => rm(path.resolve(dir, file), { recursive: true, force: true })));
		
		for (const stage of this.stages.values())
			if (!await stage.run(true)) {
				if (!this.isEntrypoint)
					log.finish();
				
				await this.exit();
				
				throw new Error(`Stage ${stage.symbol} ${stage.title} broke conveyer`);
			}
		
		return (
			this.isEntrypoint ?
				null :
				log(`✔️  ${chalk.underline("Passed")} ${chalk.bold.dim((Date.now() - this.initAt) / 1000)}`)
		);
	}
	
	async watch() {
		
		for (const stage of this.stages.values())
			await stage.watch(true);
		
	}
	
	watchQueue = new Set();
	
	enqueueWatch(stage) {
		this.watchQueue.add(stage);
		
		return this.requestSender.send("enqueueWatch");
	}
	
	async runWatchQueue() {
		
		while (this.watchQueue.size)
			for (const stage of this.stages.values())
				if (this.watchQueue.has(stage)) {
					this.watchQueue.delete(stage);
					await stage.watchQueuePromise;
					stage.watchQueuePromise = await stage.runWatchQueue();
					delete stage.watchQueuePromise;
				}
		
	}
	
	async exit(code) {
		
		for (const stage of this.stages.values()) {
			if (stage.watchdog)
				stage.isStopped = true;
			
			await stage.stop?.(code);
		}
		
		process.exit();
		
	}
	
}
