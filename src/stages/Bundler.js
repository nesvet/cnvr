import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { Worker } from "node:worker_threads";
import { COMPRESSION_LEVEL, zip } from "zip-a-folder";
import { copyRecursive } from "#utils";
import { Stage } from "./Stage.js";


/** @this Bundler */
function defaultGetName() {
	return `${this.conveyer.context.packageJSON.name}-${this.conveyer.context.packageJSON.version}`;
}


export class Bundler extends Stage {
	constructor(options = {}) {
		super({
			symbol: "📦",
			title: "Bundler",
			getName: defaultGetName,
			compressionLevel: "high",
			...options
		});
		
	}
	
	handleInited() {
		
		this.context.targets = [];
		
		return super.handleInited();
	}
	
	async do() {
		
		const targets = [
			this.target,
			...this.targets ?? [],
			...this.context?.targets ?? []
		].filter(Boolean);
		
		if (!targets.length)
			return;
		
		const tempDir = join(this.destDir, `bundle-${Date.now().toString(36)}${randomBytes(12).toString("hex")}`);
		
		await mkdir(tempDir, { recursive: true });
		
		const bundleFileName = join(this.destDir, `${this.name || this.getName(this)}.zip`);
		
		await rm(bundleFileName, { force: true });
		
		await Promise.all(targets.map(async target => {
			const [ src, relativeDest, shouldCompress, shouldRemove ] = Array.isArray(target) ? target : [ target ];
			const dest = join(tempDir, relativeDest ?? basename(src));
			
			await (
				shouldCompress ?
					Bundler.#zipWorker({ src, dest: `${dest}.zip` }) :
					copyRecursive(src, dest)
			);
			
			if (shouldRemove)
				await rm(src, { recursive: true, force: true });
			
		}));
		
		await zip(tempDir, bundleFileName, { compression: COMPRESSION_LEVEL[this.compressionLevel] });
		
		await rm(tempDir, { recursive: true, force: true });
		
		this.onDone?.(bundleFileName);
		
	}
	
	
	static #zipWorker({ src, dest }) {
		return new Promise((resolve, reject) => {
			
			new Worker(new URL("./zip-worker.js", import.meta.url), {
				workerData: { src, dest }
			})
				.once("message", resolve)
				.once("error", reject)
				.once("exit", code => code ? reject(new Error(`Worker stopped with code ${code}`)) : resolve());
			
		});
	}
}
