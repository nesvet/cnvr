import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { RequestListener, RequestSender } from "process-request";
import { debounce } from "@nesvet/n";
import { log, Packages } from "#utils";
import { entrypointFileNames, validExtensions } from "./Entrypoints.js";


const stderrFilter = [
	"The `punycode` module is deprecated"
];


export class Entrypoint {
	constructor(conveyerFileName, entrypoints, isTarget = false) {
		entrypointFileNames.push(conveyerFileName);
		
		this.conveyerFileName = conveyerFileName;
		this.entrypoints = entrypoints;
		this.isTarget = isTarget;
		
		this.conveyerName = path.basename(this.conveyerFileName).replace(/\.conveyer\.(?:[cm]?j|t)s$/, "").replace(/^\./, "");
		
		const {
			sources,
			local
		} = new Packages({
			sources: [ Packages.getClosestPackageDir(this.conveyerFileName) ],
			dev: true,
			optional: true,
			props: [
				"scripts.prebuild",
				"scripts.build",
				"scripts.postbuild"
			]
		});
		
		[ this.package ] = [ ...sources.values() ];
		this.dependencies = local;
		
		for (const pkg of this.dependencies.values())
			if (pkg.scripts?.build) {
				let dependencyConveyerFileName = /\S*\.conveyer(?:\.(?:[cm]?j|t)s)?/.exec(pkg.scripts.build)?.[0];
				if (dependencyConveyerFileName) {
					dependencyConveyerFileName = path.resolve(pkg.path, dependencyConveyerFileName);
					if (/\.(?:[cm]?j|t)s$/.test(dependencyConveyerFileName)) {
						if (!fs.existsSync(dependencyConveyerFileName))
							dependencyConveyerFileName = undefined;
					} else {
						let expectedFileName;
						for (const extension of validExtensions) {
							expectedFileName = `${dependencyConveyerFileName}.${extension}`;
							if (fs.existsSync(expectedFileName))
								break;
							expectedFileName = undefined;
						}
						dependencyConveyerFileName = expectedFileName;
					}
					if (dependencyConveyerFileName && !entrypointFileNames.includes(dependencyConveyerFileName))
						new Entrypoint(dependencyConveyerFileName, this.entrypoints);
				} else
					new BuildableDependency(pkg, this.entrypoints);
			}
		
		this.title = `${this.package.name}${this.conveyerName ? `/${this.conveyerName}` : ""}`;
		
		this.entrypoints.set(this.conveyerFileName, this);
		
	}
	
	#resolveInited;
	
	init() {
		
		if (!this.conveyerProcess)
			return new Promise(resolve => {
				this.#resolveInited = resolve;
				
				this.conveyerProcess = childProcess.fork(this.conveyerFileName, this.entrypoints.otherArgs, {
					cwd: this.package.path,
					env: {
						...process.env,
						IS_ENTRYPOINT: true,
						...this.isTarget && { IS_ENTRYPOINT_TARGET: true }
					},
					stdio: "pipe"
				});
				
				this.conveyerProcess.stdout.on("data", this.#handleConveyerProcessStdout);
				this.conveyerProcess.stderr.on("data", this.#handleConveyerProcessStderr);
				
				this.conveyerProcess.on("error", this.#handleConveyerProcessError);
				this.conveyerProcess.on("exit", this.#handleConveyerProcessExit);
				
				this.requestSender = new RequestSender(this.conveyerProcess);
				new RequestListener(this.conveyerProcess, this.#conveyerProcessRequestHandlers);
				
			});
	}
	
	async reinit() {
		
		await new Promise(resolve => {
			this.resolveExited = resolve;
			
			this.conveyerProcess?.kill("SIGINT");
			
		});
		
		await this.init();
		
	}
	
	#handleConveyerProcessStdout = data => log(data.toString().trim(), "info", this.title);
	
	#handleConveyerProcessStderr = async data => {
		const string = data.toString().trim();
		
		for (const item of stderrFilter)
			if (string.includes(item))
				return;
		
		await log(string, "error", this.title);
		
	};
	
	#handleConveyerProcessError = error => log(`❗️ ${chalk.bold(this.title)}: ${error}`, "error");
	
	#handleConveyerProcessExit = () => {
		
		delete this.conveyerProcess;
		
		this.resolveExited?.();
		
		log(`🚪 ${chalk.bold(this.title)} conveyer exited`);
		
	};
	
	#conveyerProcessRequestHandlers = {
		
		init: (options = {}, nodeEnv) => {
			this.options = options;
			
			this.initAt = Date.now();
			
			return log.progress({ symbol: "🌀", title: `${this.package.version} ${chalk.dim(nodeEnv)}` }, this.title, this.isTarget);
		},
		
		inited: () => {
			
			log.finish();
			
			this.#resolveInited?.();
			
		},
		
		beginStage: props => log.progress(props, this.title),
		
		doneStage: props => log.finish(props),
		
		logFinish: props => log.finish(props),
		
		enqueueWatch: debounce(() => this.entrypoints.enqueueWatch(this), 100)
		
	};
	
	async run() {
		
		try {
			await this.requestSender.send("run");
			
			return await log(`✔️  ${chalk.underline("Passed")} ${chalk.bold.dim((Date.now() - this.initAt) / 1000)}`, "info", this.title);
		} catch {
			return log.finish();
		}
	}
	
	watch() {
		return this.requestSender.send("watch");
	}
	
	runWatchQueue() {
		return this.requestSender.send("runWatchQueue");
	}
	
}

class BuildableDependency {
	constructor(pkg, entrypoints) {
		this.package = pkg;
		this.entrypoints = entrypoints;
		
		this.entrypoints.buildableDependencies.set(this.package.path, this);
		
	}
	
	async run() {
		
		await log.progress({ symbol: "🏗️ " }, this.package.name);
		
		try {
			await this.package.rebuild();
			
			log.finish();
		} catch (error) {
			log.finish();
			
			await log(error.stack, "error");
		}
		
	}
	
	watch() {
		
		// TODO:
		
	}
	
}
