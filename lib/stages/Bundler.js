import crypto from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import open from "open";
import { COMPRESSION_LEVEL, zip } from "zip-a-folder";
import { copyRecursive } from "#utils";
import { Stage } from "./Stage.js";


/** @this Bundler */
function defaultGetName() {
	return `${this.conveyer.context.packageJSON.name}-${this.conveyer.context.packageJSON.version}`;
}

const radix = 36;
const randomBytesSize = 12;

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
	
	do = () => Bundler.compress.call(this, this);
	
	
	static async compress({
		destDir,
		name,
		getName = defaultGetName,
		target: targetProp,
		targets = [ targetProp ],
		compressionLevel = "high",
		context,
		showInFolder = false
	}) {
		targets = [
			...targets,
			...context?.targets ?? []
		].filter(Boolean);
		
		if (targets.length) {
			const tempBundleDir = join(destDir, `bundle-${Date.now().toString(radix)}${crypto.randomBytes(randomBytesSize).toString("hex")}`);
			await mkdir(tempBundleDir, { recursive: true });
			
			const bundleFileName = join(destDir, `${name || getName.call(this, this)}.zip`);
			await rm(bundleFileName, { force: true });
			
			for (const target of targets) {
				const [ srcPath, relativeDestPath, shouldCompress ] = Array.isArray(target) ? target : [ target ];
				const destPath = join(tempBundleDir, relativeDestPath ?? basename(srcPath));
				
				await copyRecursive(srcPath, destPath);
				
				if (shouldCompress) {
					await zip(srcPath, `${destPath}.zip`);
					await rm(destPath, { recursive: true, force: true });
				}
			}
			
			await zip(tempBundleDir, bundleFileName, { compression: COMPRESSION_LEVEL[compressionLevel] });
			await rm(tempBundleDir, { recursive: true, force: true });
			
			if (showInFolder)
				open(destDir);
			
			return bundleFileName;
		}
	}
	
}
