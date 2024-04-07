import crypto from "node:crypto";
import path from "node:path";
import fse from "fs-extra";
import open from "open";
import { zip } from "zip-a-folder";
import { Stage } from "./Stage.js";


/** @this Bundler */
function defaultGetName() {
	return `${this.conveyerContext.packageJSON.name}-${this.conveyerContext.packageJSON.version}`;
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
		context,
		showInFolder = false
	}) {
		targets = [
			...targets,
			...context?.targets ?? []
		].filter(Boolean);
		
		if (targets.length) {
			const tempBundleDir = path.join(destDir, `bundle-${Date.now().toString(radix)}${crypto.randomBytes(randomBytesSize).toString("hex")}`);
			await fse.ensureDir(tempBundleDir);
			
			const bundleFileName = path.join(destDir, `${name || getName.call(this, this)}.zip`);
			await fse.remove(bundleFileName);
			
			for (const target of targets) {
				const [ srcPath, relativeDestPath, shouldCompress ] = Array.isArray(target) ? target : [ target ];
				const destPath = path.join(tempBundleDir, relativeDestPath ?? path.basename(srcPath));
				
				await fse.copy(srcPath, destPath);
				
				if (shouldCompress) {
					await zip(srcPath, `${destPath}.zip`);
					await fse.remove(destPath);
				}
			}
			
			await zip(tempBundleDir, bundleFileName);
			await fse.remove(tempBundleDir);
			
			if (showInFolder)
				open(destDir);
			
			return bundleFileName;
		}
	}
	
}
