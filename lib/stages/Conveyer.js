import path from "node:path";
import { sleep } from "@nesvet/n";
import chalk from "chalk";
import chokidar from "chokidar";
import fse from "fs-extra";
import { RequestListener, RequestSender } from "process-request";
import { env } from "#utils/env.js";
import { log } from "#utils/log.js";
import "#utils/BigInt.js";


if (process.env.IS_ENTRYPOINT) {
	process.env.WATCH = true;
	if (process.env.IS_ENTRYPOINT_NOT_TARGET) {
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
}

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
		
		this.name = path.basename(process.argv[1]).replace(/.conveyer(.[mc]?js)?$/, "").replace(/^\./, "");
		
		this.options = {
			context: {},
			initialCleanup: initialCleanup ? (Array.isArray(initialCleanup) ? initialCleanup : [ initialCleanup ]).filter(Boolean) : false,
			...restOptions
		};
		
		this.isEntrypoint = !!IS_ENTRYPOINT;
		
		if (WATCH)
			this.watchers.push(chokidar.watch("package.json").on("all", this.updateContextPackageJSON));
		else
			this.updateContextPackageJSON();
		
		let i = 1;
		for (const stage of stages.flat(stagesFlatDepth))
			if (stage) {
				if (!stage.title)
					stage.title = stage.constructor.name;
				
				if (!stage.id)
					stage.id = stage.title.toLowerCase().replace(/\W/g, "");
				
				while (this.stages.has(stage.id))
					stage.id += i;
				
				this.stages.set(stage.id, stage);
				stage.conveyer = this;
				stage.conveyerContext = this.options.context;
				stage.context = stage.conveyerContext[stage.id] = {};
				
				i++;
			}
		
		process.on("exit", code => this.exit(code));
		process.on("SIGINT", () => this.exit("SIGINT"));
		process.on("SIGTERM", () => this.exit("SIGTERM"));
		
		if (this.isEntrypoint) {
			this.requestSender = new RequestSender(process);
			new RequestListener(process, method => this[method]());
		}
		
		this.init();
		
	}
	
	stages = new Map();
	
	watchers = [];
	
	updateContextPackageJSON = async () => {
		
		try {
			for (let i = 1; i <= 5; i++)
				try {
					const packageJSON = fse.readJsonSync("package.json");
					
					this.title = `${packageJSON.name}${this.name ? `/${this.name}` : ""}`;
					this.version = packageJSON.version;
					this.options.context.packageJSON = packageJSON;
					
					return;
				} catch {
					await sleep(i * 10);
				}
			
			throw 0;
		} catch {
			this.title = "";
			this.version = "";
			this.options.context.packageJSON = {};
		}
		
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
		
		if (this.isEntrypoint)
			this.requestSender.send("inited");
		else {
			log.finish();
			
			return this.run();
		}
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
				await fse.emptyDir(dir);
		
		for (const stage of this.stages.values())
			if (!await stage.run(true)) {
				if (!this.isEntrypoint)
					log.finish();
				
				await this.exit();
				
				throw 1;
			}
		
		if (!this.isEntrypoint)
			return log(`✔️  ${chalk.underline("Passed")} ${chalk.bold.dim((Date.now() - this.initAt) / 1000)}`);
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
