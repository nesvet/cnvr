import { ChildProcess } from "./ChildProcess.js";


export class BunProcess extends ChildProcess {
	constructor({
		entry = ".",
		inspect = false,
		hot = false,
		smol = false,
		args = [],
		watch,
		...restOptions
	}) {
		super({
			symbol: "🍞",
			title: "Bun",
			command: "bun",
			entry,
			args: [
				"run",
				inspect && `--inspect${typeof inspect == "string" ? `=${inspect}` : ""}`,
				hot && "--hot",
				smol && "--smol",
				entry,
				...args
			].filter(Boolean),
			watchdog: false,
			watch: {
				events: [ "change" ],
				...watch
			},
			...restOptions
		});
		
	}
	
}

