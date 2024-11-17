import childProcess from "node:child_process";
import { isRunning } from "#utils/isRunning";
import { ChildProcess } from "./ChildProcess.js";


const awaitNginxStopInterval = 250;

export class NginxProcess extends ChildProcess {
	constructor(options = {}) {
		const {
			config,
			args = [],
			watch,
			...restOptions
		} = options;
		
		super({
			symbol: "🕸 ",
			title: "nginx",
			command: "nginx",
			args: [
				...config ? [ "-c", config ] : [],
				...args
			],
			checkIfRunning: true,
			watch: config && {
				events: [ "change" ],
				...watch,
				paths: [
					config,
					...watch?.paths ?? []
				]
			},
			watchdog: false,
			isDetached: true,
			...restOptions
		});
		
	}
	
	async stop() {
		
		childProcess.exec("nginx -s stop");
		
		await new Promise(resolve => {
			const interval = setInterval(async () => await isRunning("nginx") || resolve(clearInterval(interval)), awaitNginxStopInterval);
			interval.unref();
			
		});
		
		this.isExited = true;
		
	}
	
}
