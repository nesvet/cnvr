import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import anymatch from "anymatch";
import chalk from "chalk";
import { watch } from "chokidar";
import { RequestListener, RequestSender } from "process-request";
import { debounce } from "@nesvet/n";
import { log, Packages } from "$utils";
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
	
	run() {
		return this.requestSender.send("run")
			.then(() => log(`✔️  ${chalk.underline("Passed")} ${chalk.bold.dim((Date.now() - this.initAt) / 1000)}`, "info", this.title))
			.catch(() => log.finish());
	}
	
	async watch() {
		
		await this.requestSender.send("watch");
		
		new Entrypoint.PackageWatcher(this.package, { chokidar: {
			awaitWriteFinish: {
				stabilityThreshold: 500,
				pollInterval: 50
			}
		} });
		
	}
	
	runWatchQueue() {
		return this.requestSender.send("runWatchQueue");
	}
	
	
	static {
		
		const packageWatchers = new Map();
		
		const defaultIgnored = [
			"node_modules",
			"package.json",
			"package-lock.json",
			"yarn.lock",
			"pnpm-lock.yaml",
			"bun.lockb",
			"Thumbs.db"
		];
		
		const handlesSymbol = Symbol("handles");
		const bumpVersionSymbol = Symbol("bumpVersion");
		const rebuildSymbol = Symbol("rebuild");
		
		function PackageWatcher(pkg, {
			chokidar: {
				ignored: chokidarIgnored,
				...restChokidarOptions
			} = {},
			handle,
			bumpVersion: bumpVersionOnChange = true,
			rebuild: rebuildOnChange
		} = {}) {
			
			let watcher = packageWatchers.get(pkg.path);
			
			if (!watcher) {
				watcher = watch(pkg.path, {
					ignored: absolutePath => {
						const basename = path.basename(absolutePath);
						
						return (
							basename.startsWith(".") ||
							basename.endsWith("ignore") ||
							defaultIgnored.includes(basename) ||
							!chokidarIgnored || (
								Array.isArray(chokidarIgnored) ?
									chokidarIgnored.some(pathToIgnore => path.isAbsolute(pathToIgnore) ? pathToIgnore === absolutePath : pathToIgnore === basename) :
									typeof chokidarIgnored == "function" ?
										chokidarIgnored(absolutePath) :
										false
							)
						);
					},
					ignoreInitial: true,
					...restChokidarOptions
				});
				
				watcher[handlesSymbol] = new Set();
				
				watcher.on("all", async (event, fileName, stats) => {
					
					const matchersToIgnore = [];
					
					let dirName = fileName;
					do {
						dirName = path.dirname(dirName);
						const gitignorePath = path.join(dirName, ".gitignore");
						if (fs.existsSync(gitignorePath))
							for (const line of (await fs.promises.readFile(gitignorePath, "utf8")).split("\n"))
								if (!/^(#.*)?$/.test(line.trim())) {
									let matcher = path.resolve(dirName, line);
									try {
										if ((await fs.promises.stat(matcher)).isDirectory())
											matcher = path.resolve(matcher, "**");
										matchersToIgnore.push(matcher);
									} catch {}
								}
					} while (dirName !== pkg.path);
					
					if (!matchersToIgnore.length || !anymatch(matchersToIgnore, fileName)) {
						if (watcher[rebuildSymbol]) {
							await log.progress({ symbol: "🏗️ ", title: "Rebuilding" }, pkg.name);
							try {
								await pkg.rebuild();
								log.finish();
							} catch (error) {
								log.finish();
								await log(error.stack, "error");
							}
						}
						
						for (const watcherHandle of watcher[handlesSymbol])
							await watcherHandle(event, fileName, stats);
						
						if (watcher[bumpVersionSymbol]) {
							await pkg.bumpVersion();
							await log(`🚀 ${pkg.version}`, "info", pkg.name);
						}
					}
					
				});
				
				packageWatchers.set(pkg.path, watcher);
			}
			
			if (handle)
				watcher[handlesSymbol].add(handle);
			
			if (bumpVersionOnChange)
				watcher[bumpVersionSymbol] = true;
			
			if (rebuildOnChange)
				watcher[rebuildSymbol] = true;
			
			return watcher;
		}
		
		this.PackageWatcher = PackageWatcher;
		
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
		
		new Entrypoint.PackageWatcher(this.package, {
			bumpVersion: true,
			rebuild: true
		});
		
	}
	
}
