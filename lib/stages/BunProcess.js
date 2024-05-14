import { NodeProcess } from "./NodeProcess.js";


export class BunProcess extends NodeProcess {
	constructor(options) {
		super({
			symbol: "🥯",
			title: "Bun",
			command: "bun",
			...options
		});
		
	}
	
}
