import childProcess from "node:child_process";
import { noop } from "@nesvet/n";
import { isRunning } from "#utils/isRunning.js";
import { Stage } from "./Stage.js";


export class ChildProcess extends Stage {
	constructor({ command, watch, ...restOptions }) {
		super({
			symbol: "⚙️ ",
			title: `${command} process`,
			command,
			cwd: Object.values(process._conveyerEnv)[0]?.dir,
			watchdog: true,
			checkIfRunning: false,
			args: [],
			stdio: [ "inherit", "inherit", "inherit", "ipc" ],
			isDetached: false,
			...restOptions,
			watch: {
				paths: [],
				events: [ "change" ],
				...watch
			}
		});
		
	}
	
	#process = null;
	
	#isRestarting = false;
	
	#isStopped = false;
	
	async start() {
		
		if (this.checkIfRunning && await isRunning(this.command)) {
			this.stop = noop;
			console.warn(`⚠️${this.symbol} ${this.title} is already running`);
		} else {
			this.#process = childProcess.spawn(this.command, this.args, {
				stdio: this.stdio,
				env: { ...process.env, ...this.env },
				cwd: this.cwd
			});
			
			if (!this.isDetached)
				this.#process.on("exit", this.watchdog ? this.#handleWatchdogExit : this.#handleExit);
			
			if (this.stdio.includes("ipc"))
				this.#process.on("message", this.#handleMessage);
			
		}
		
	}
	
	stop() {
		
		this.#process?.kill("SIGKILL");
		
	}
	
	async do() {
		
		if (this.#process) {
			this.#isRestarting = true;
			if (this.isDetached)
				this.stop();
			else
				await new Promise(resolve => {
					this.#process.on("exit", resolve);
					this.stop();
					
				});
			this.#isRestarting = false;
		}
		
		await this.start();
		
	}
	
	#handleMessage = message => {
		
		try {
			const [ kind, ...rest ] = message;
			this.#messageHandlers[kind].apply(this, rest);
		} catch {}
		
	};
	
	#messageHandlers = {
		
		restart(args) {
			if (args)
				for (const arg of args) {
					const keyRegExp = new RegExp(`^${arg.replace(/=.*$/, "")}(=|$)`);
					const index = this.args.findIndex(thisArg => keyRegExp.test(thisArg));
					
					if (~index)
						this.args[index] = arg;
					else
						this.args.unshift(arg);
				}
			
			this.stop();
			
			if (!this.watchdog)
				this.start();
			
		}
		
	};
	
	#handleExit = () => {
		
		if (this.#isRestarting)
			this.#isRestarting = false;
		else {
			this.#process = null;
			console.info(`🚪${this.symbol} ${this.title} exited`);
		}
		
	};
	
	#handleWatchdogExit = () =>
		!this.#isStopped &&
		!this.#isRestarting &&
		this.start();
	
}
