import { execSync, spawn } from "node:child_process";
import { parse } from "node:path";
import { noop } from "@nesvet/n";
import { isRunning } from "#utils";
import { Stage } from "./Stage.js";


export class ChildProcess extends Stage {
	constructor({ command, watch, filterStdout, filterStderr, ...restOptions }) {
		super({
			symbol: "⚙️ ",
			title: `${command} process`,
			command,
			cwd: Object.values(process._conveyerEnv)[0]?.dir,
			watchdog: true,
			checkIfRunning: false,
			args: [],
			stdio: [
				"ignore",
				filterStdout ? "pipe" : "inherit",
				filterStderr ? "pipe" : "inherit",
				"ipc"
			],
			filterStdout,
			filterStderr,
			isDetached: false,
			stopTimeout: 3000,
			killTimeout: 1000,
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
			this.#process = spawn(this.command, this.args, {
				detached: this.isDetached,
				stdio: this.stdio,
				env: { ...process.env, ...this.env },
				cwd: this.cwd
			});
			
			this.#process.on("exit", this.watchdog ? this.#handleWatchdogExit : this.#handleExit);
			
			if (this.stdio.includes("ipc"))
				this.#process.on("message", this.#handleMessage);
			
			if (this.filterStdout)
				this.#process.stdout.on("data", data => {
					const string = data.toString();
					
					if (!this.filterStdout.some(substring => string.includes(substring)))
						process.stderr.write(string);
					
				});
			
			if (this.filterStderr)
				this.#process.stderr.on("data", data => {
					const string = data.toString();
					
					if (!this.filterStderr.some(substring => string.includes(substring)))
						process.stderr.write(string);
					
				});
		}
		
	}
	
	stop(signalOrCode) {
		
		if (!this.#process)
			return;
		
		const subprocess = this.#process;
		subprocess.off("exit", this.#handleWatchdogExit);
		
		const signal = (typeof signalOrCode === "string" && signalOrCode.startsWith("SIG")) ?
			signalOrCode :
			"SIGTERM";
		
		return new Promise(resolve => {
			
			if (subprocess.exitCode !== null || subprocess.signalCode !== null) {
				this.#process = null;
				
				resolve();
			} else {
				let forceKillTimer;
				
				const cleanup = () => {
					
					clearTimeout(forceKillTimer);
					
					this.#process = null;
					
					resolve();
					
				};
				
				subprocess.once("exit", cleanup);
				subprocess.once("error", cleanup);
				
				this.#killProcess(subprocess, signal);
				
				forceKillTimer = setTimeout(() => {
					
					this.#killProcess(subprocess, "SIGKILL");
					
					setTimeout(cleanup, this.killTimeout);
					
				}, this.stopTimeout);
			}
			
		});
	}
	
	#killProcess(subprocess, signal) {
		
		try {
			if (process.platform === "win32")
				if (signal === "SIGKILL")
					execSync(`taskkill /pid ${subprocess.pid} /T /F`, { stdio: "ignore" });
				else
					subprocess.kill(signal);
			else
				if (this.isDetached)
					try {
						process.kill(-subprocess.pid, signal);
					} catch {}
				else
					subprocess.kill(signal);
		} catch {}
		
	}
	
	async do() {
		
		if (this.#process) {
			this.#isRestarting = true;
			
			await this.stop();
			
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
			if (args) {
				for (const arg of args) {
					const keyRegExp = new RegExp(`^${arg.replace(/=.*$/, "")}(=|$)`);
					
					const index = this.args.findIndex(thisArg => keyRegExp.test(thisArg));
					
					if (~index)
						this.args[index] = arg;
					else
						this.args.unshift(arg);
				}
				
				if (args.length && parse(args.at(-1)).root)
					if (this.args.length && parse(this.args.at(-1)).root)
						this.args[this.args.length - 1] = args.at(-1);
					else
						this.args.push(args.at(-1));
			}
			
			this.do();
			
		}
		
	};
	
	#handleExit = () => {
		
		if (this.#isRestarting)
			return;
		
		this.#process = null;
		
		console.info(`🚪${this.symbol} ${this.title} exited`);
		
	};
	
	#handleWatchdogExit = () =>
		!this.#isStopped &&
		!this.#isRestarting &&
		this.start();
	
}
