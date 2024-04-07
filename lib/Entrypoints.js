import path from "node:path";
import chokidar from "chokidar";
import fse from "fs-extra";
import { log } from "#utils/log.js";
import { Packages } from "#utils/Packages.js";
import { VersionBumper } from "#utils/VersionBumper.js";
import "./env.js";
import { Entrypoint } from "./Entrypoint.js";


const { FORCE } = process.env;

const cwd =
	process.env.CONVEYER_TARGET_WD =
		process.cwd();


export class Entrypoints extends Map {
	constructor(options = {}, immediate) {
		super();
		
		Object.assign(this, {
			entrypointsWatchQueueDelay: 300,
			...options
		});
		
		let filenames = process.argv.slice(2)// eslint-disable-line no-magic-numbers
			.filter(arg => !/^-/.test(arg))
			.map(name => `${/^\./.test(name) ? "" : "."}${name}${/\.conveyer/.test(name) ? "" : `${/\.$/.test(name) ? "" : "."}conveyer`}.js`);
		
		filenames =
			filenames.length ?
				filenames.filter(fse.existsSync) :
				Entrypoints.get(cwd);
		
		if (!filenames.length)
			return log("❌ No valid conveyer entrypoints", "error");
		
		for (const filename of filenames)
			this.targets.push(new Entrypoint(filename, this, true));
		
		this.dirnames = filenames.map(path.dirname);
		
		this.localPackages = new Packages({ sources: this.dirnames, dev: true, optional: true }).local().asPaths();
		
		this.others = this.localPackages.map(Entrypoints.get).flat().map(filename => new Entrypoint(filename, this));
		
		this.reversed = [ ...this.targets, ...this.others ].reverse();
		
		if (immediate)
			this.run();
		
	}
	
	options = {};
	
	targets = [];
	
	watchers = [];
	
	entrypointsWatchQueue = new Set();
	
	isEntrypointsWatchQueueRunning = false;
	
	argv = process.argv.filter(arg => /^--/.test(arg));
	
	async run() {
		
		const packagesToBumpVersion = new Map([ ...this.dirnames, ...this.localPackages ].map(packagePath => [ packagePath, {} ]));
		
		for (const entrypoint of this.reversed) {
			await entrypoint.init();
			
			const { bumpVersions } = entrypoint.options;
			
			if (bumpVersions === false)
				packagesToBumpVersion.delete(entrypoint.dirname);
			else if (bumpVersions)
				Object.assign(packagesToBumpVersion.get(entrypoint.dirname), bumpVersions);
		}
		
		for (const entrypoint of FORCE ? this.reversed : this.targets)
			await entrypoint.run();
		
		/*
		 * Sleep for 200 ms for files to be written or something
		 * that triggers watcher's "change" event on initial run
		 */
		await new Promise(resolve => setTimeout(resolve, 200));// eslint-disable-line no-magic-numbers
		
		for (const entrypoint of this.reversed)
			await entrypoint.watch();
		
		
		this.watchers.push(
			chokidar
				.watch([ ...this.keys() ], { ignoreInitial: true })
				.on("change", async filename => {
					const entrypoint = this.get(filename);
					
					await entrypoint.reinit();
					await entrypoint.run();
					await entrypoint.watch();
					
				})
		);
		
		if (packagesToBumpVersion.size) {
			log("👀 Watching packages to bump their versions:");
			for (const [ packagePath, options ] of packagesToBumpVersion) {
				this.watchers.push(VersionBumper.watch(packagePath, options));
				log(` ⎣ ${packagePath}`);
			}
		}
		
	}
	
	enqueueWatch(entrypoint) {
		this.entrypointsWatchQueue.add(entrypoint);
		
		if (!this.isEntrypointsWatchQueueRunning)
			this.runEntrypointsWatchQueue();
		
	}
	
	async runEntrypointsWatchQueue() {
		
		this.isEntrypointsWatchQueueRunning = true;
		
		while (this.entrypointsWatchQueue.size)
			for (const entrypoint of this.reversed)
				if (this.entrypointsWatchQueue.has(entrypoint)) {
					await entrypoint.runWatchQueue();
					this.entrypointsWatchQueue.delete(entrypoint);
					await new Promise(resolve => setTimeout(resolve, this.entrypointsWatchQueueDelay));
				}
		
		this.isEntrypointsWatchQueueRunning = false;
		
	}
	
	
	static get(dirname) {
		return fse
			.readdirSync(dirname)
			.filter(name => /^(\..+)?\.conveyer\.[mc]?js$/.test(name))
			.map(name => path.resolve(dirname, name));
	}
	
}
