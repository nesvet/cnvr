import path from "node:path";
import { require } from "#utils/require";
import { ChildProcess } from "./ChildProcess.js";


export class NodeProcess extends ChildProcess {
	constructor({
		entry = ".",
		inspect = true,
		enableSourceMaps = true,
		traceWarnings = true,
		traceUncaught = true,
		args = [],
		watch,
		...restOptions
	}) {
		super({
			symbol: "🧩",
			title: "Node.js",
			command: "node",
			entry,
			args: [
				inspect && `--inspect${typeof inspect == "string" ? `=${inspect}` : ""}`,
				enableSourceMaps && "--enable-source-maps",
				traceWarnings && "--trace-warnings",
				traceUncaught && "--trace-uncaught",
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
	
	do(isInitial) {
		if (isInitial)
			this.watchPaths.unshift(require.resolve(path.resolve(this.cwd ?? "", this.entry)));
		
		return super.do();
	}
	
}
