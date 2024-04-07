import childProcess from "node:child_process";
import path from "node:path";
import { RequestListener, RequestSender } from "@nesvet/process-request";
import chalk from "chalk";
import fse from "fs-extra";
import { log } from "#utils/log.js";


export class Entrypoint {
	constructor(filename, host, isTarget) {
		this.filename = filename;
		this.host = host;
		this.isTarget = isTarget;
		
		this.name = path.basename(this.filename).replace(/.conveyer.[mc]?js$/, "").replace(/^\./, "");
		this.dirname = path.dirname(this.filename);
		
		try {
			const { name, version } = fse.readJsonSync(path.resolve(this.dirname, "package.json"));
			this.packageName = name;
			this.version = version;
		} catch {
			throw new Error(`Can't find package.json next to ${this.filename}`);
		}
		
		this.title = this.packageName + (this.name ? `/${this.name}` : "");
		
		this.host.set(this.filename, this);
		
	}
	
	init() {
		
		if (!this.conveyerProcess)
			return new Promise(resolve => {
				this.resolveInited = resolve;
				
				this.conveyerProcess = childProcess.fork(this.filename, this.host.argv, {
					cwd: this.dirname,
					env: {
						...process.env,
						IS_ENTRYPOINT: true,
						...this.isTarget ?
							{ IS_ENTRYPOINT_TARGET: true } :
							{ IS_ENTRYPOINT_NOT_TARGET: true }
					},
					stdio: "pipe"
				});
				
				this.conveyerProcess.stdout.on("data", this.#handleConveyerProcessStdout);
				this.conveyerProcess.stderr.on("data", this.#handleConveyerProcessStderr);
				
				this.conveyerProcess.on("error", this.#handleConveyerProcessError);
				this.conveyerProcess.on("exit", this.#handleConveyerProcessExit);
				
				this.requestSender = new RequestSender(this.conveyerProcess);
				new RequestListener(this.conveyerProcess, this.conveyerProcessRequestHandlers);
				
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
	
	#handleConveyerProcessStderr = data => log(data.toString().trim(), "error", this.title);
	
	#handleConveyerProcessError = error => log(`❗️ ${chalk.bold(this.title)}: ${error}`, "error");
	
	#handleConveyerProcessExit = () => {
		
		delete this.conveyerProcess;
		
		this.resolveExited?.();
		
		log(`🚪 ${chalk.bold(this.title)} exited`);
		
	};
	
	conveyerProcessRequestHandlers = {
		
		init: (options = {}, nodeEnv) => {
			this.options = options;
			
			this.initAt = Date.now();
			
			return log.progress({ symbol: "🌀", title: `${this.version} ${chalk.dim(nodeEnv)}` }, this.title, this.isTarget);
		},
		
		inited: () => {
			
			log.finish();
			
			this.resolveInited?.();
			
		},
		
		beginStage: props => log.progress(props, this.title),
		
		doneStage: props => log.finish(props),
		
		logFinish: props => log.finish(props),
		
		enqueueWatch: () => this.host.enqueueWatch(this)
		
	};
	
	run() {
		return this.requestSender.send("run")
			.then(() => log(`✔️  ${chalk.underline("Passed")} ${chalk.bold.dim((Date.now() - this.initAt) / 1000)}`, "info", this.title))
			.catch(() => log.finish());
	}
	
	watch() {
		return this.requestSender.send("watch")
			.then(() => log(`👀 Watching ${this.title}`));
	}
	
	runWatchQueue() {
		return this.requestSender.send("runWatchQueue");
	}
	
}
