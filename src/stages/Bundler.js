import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { Worker } from "node:worker_threads";
import open from "open";
import { COMPRESSION_LEVEL, zip } from "zip-a-folder";
import { copyRecursive } from "#utils";
import { Stage } from "./Stage.js";


const radix = 36;
const randomBytesSize = 12;

/** @this Bundler */
function defaultGetName() {
	return `${this.conveyer.context.packageJSON.name}-${this.conveyer.context.packageJSON.version}`;
}

export class Bundler extends Stage {
	constructor(options = {}) {
		super({
			symbol: "📦",
			title: "Bundler",
			...options
		});
		
	}
	
	handleInited() {
		
		this.context.targets = [];
		
		return super.handleInited();
	}
	
	do = () => Bundler.#compress.call(this, this);
	
	
	static async #compress({
		destDir,
		name,
		getName = defaultGetName,
		target: singleTarget,
		targets = [ singleTarget ],
		compressionLevel = "high",
		context,
		showInFolder = false
	}) {
		
		targets = [
			...targets,
			...context?.targets ?? []
		].filter(Boolean);
		
		if (!targets.length)
			return;
		
		const tempDir = join(destDir, `bundle-${Date.now().toString(radix)}${randomBytes(randomBytesSize).toString("hex")}`);
		
		await mkdir(tempDir, { recursive: true });
		
		const bundleFileName = join(destDir, `${name || getName.call(this, this)}.zip`);
		
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
		
		await zip(tempDir, bundleFileName, { compression: COMPRESSION_LEVEL[compressionLevel] });
		
		await rm(tempDir, { recursive: true, force: true });
		
		if (showInFolder)
			open(destDir);
		
		return bundleFileName;
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
