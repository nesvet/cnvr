import { ChildProcess } from "./ChildProcess.js";


const defaultConfigPath = "/usr/local/etc/mongod.conf";


export class MongodProcess extends ChildProcess {
	constructor(options = {}) {
		const {
			config,
			args = [],
			watch,
			...restOptions
		} = options;
		
		super({
			symbol: "🌿",
			title: "MongoDB",
			command: "mongod",
			args: [ "--config", config ?? defaultConfigPath, ...args ],
			checkIfRunning: true,
			watch: config ? {
				events: [ "change" ],
				...watch,
				paths: [
					config,
					...watch?.paths ?? []
				]
			} : false,
			watchdog: false,
			...restOptions
		});
		
	}
	
}
