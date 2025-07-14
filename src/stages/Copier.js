import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { copyRecursive, pathExists } from "$utils";
import { Stage } from "./Stage.js";


function sortTargets(a, b) {
	return a[0] > b[0] ? -1 : a[0] < b[0] ? 1 : 0;
}

export class Copier extends Stage {
	constructor({ targets, watch, ...restOptions }) {
		if (typeof targets[0] == "string")
			targets = [ targets ];
		
		super({
			symbol: "🛒",
			title: "Copier",
			targets,
			watch: {
				ignoreInitial: true,
				events: [ "all" ],
				...watch
			},
			...restOptions
		});
		
	}
	
	handleInited() {
		
		this.context.targets = new Map();
		
		return super.handleInited();
	}
	
	async copy(isInitial, eventMap) {
		if (isInitial) {
			this.targets = new Map([ ...this.targets, ...[ ...this.context.targets ].map(entry => entry.reverse()) ].filter(Boolean).map(([ src, dest ]) => [ path.resolve(src), path.resolve(dest) ]).sort(sortTargets));
			
			this.watchPaths = [];
			
			for (const [ src, dest ] of this.targets)
				if (await pathExists(src)) {
					this.watchPaths.push(src);
					if ((await stat(src)).isDirectory())
						this.watchPaths.push(`${src}/**`);
					await copyRecursive(src, dest);
				} else
					throw new Error(`Path ${src} not exists`);
			
		} else if (eventMap)
			for (const [ eventPath, eventName ] of eventMap) {
				let src, dest;
				for ([ src, dest ] of this.targets)
					if (src === eventPath)
						break;
					else if (eventPath.indexOf(src) === 0) {
						dest = path.join(dest, eventPath.replace(src, ""));
						break;
					}
				
				if (eventName === "add" || eventName === "change")
					await copyRecursive(eventPath, dest);
				else if (eventName === "addDir")
					await mkdir(dest, { recursive: true });
				else if (eventName === "unlink" || (eventName === "unlinkDir" && eventPath !== src))
					await rm(dest, { recursive: true, force: true });
			}
		
	}
	
	do = this.copy;
	
}
