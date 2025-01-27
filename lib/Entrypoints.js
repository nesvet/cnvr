import fs from "node:fs";
import path from "node:path";
import { watch } from "chokidar";
import { sleep } from "@nesvet/n";
import "./env.js";
import { log, setNodePath } from "#utils";
import { Entrypoint } from "./Entrypoint.js";


const { FORCE } = process.env;

export const validExtensions = [ "js", "cjs", "mjs", "ts" ];

const argsWithValue = [
	[ "-e", "--env" ]
].flat();

export const entrypointFileNames = [];


export class Entrypoints extends Map {
	constructor({ entrypointsWatchQueueDelay } = {}, immediate) {
		super();
		
		if (entrypointsWatchQueueDelay)
			this.#entrypointsWatchQueueDelay = entrypointsWatchQueueDelay;
		
		const conveyerFileNameArgs = [];
		for (let { length } = process.argv, i = 2; i < length; i++) {
			const arg = process.argv[i];
			if (arg.startsWith("-")) {
				this.otherArgs.push(arg);
				if (argsWithValue.includes(arg))
					this.otherArgs.push(process.argv[++i]);
			} else
				conveyerFileNameArgs.push(arg);
		}
		
		const conveyerFileNames = Entrypoints.getConveyerFiles(conveyerFileNameArgs);
		
		if (!conveyerFileNames)
			return log("❌ No valid conveyer entrypoints", "error");
		
		for (const conveyerFileName of conveyerFileNames)
			if (!entrypointFileNames.includes(conveyerFileName))
				new Entrypoint(conveyerFileName, this, true);
		
		if (immediate)
			this.run();
		
	}
	
	otherArgs = [];
	
	buildableDependencies = new Map();
	
	#entrypointsWatchQueue = new Set();
	#entrypointsWatchQueueDelay = 300;
	
	#isEntrypointsWatchQueueRunning = false;
	
	async run() {
		
		for (const entrypoint of this.values())
			await entrypoint.init();
		
		for (const item of FORCE ? [ ...this.buildableDependencies.values(), ...this.values() ] : this.values())
			if (item.isTarget || FORCE)
				await item.run();
		
		await sleep(1000);
		
		await log("👀 Watching packages");
		for (const item of [ ...this.buildableDependencies.values(), ...this.values() ]) {
			await item.watch();
			await log(` ⎣ ${item.package.name}`);
		}
		
		watch([ ...this.keys() ], {
			ignoreInitial: true,
			awaitWriteFinish: {
				stabilityThreshold: 500,
				pollInterval: 50
			}
		}).on("change", async conveyerFileName => {
			const entrypoint = this.get(conveyerFileName);
			
			await entrypoint.reinit();
			await entrypoint.run();
			await entrypoint.watch();
			
		});
		
	}
	
	enqueueWatch(entrypoint) {
		this.#entrypointsWatchQueue.add(entrypoint);
		
		if (!this.#isEntrypointsWatchQueueRunning)
			this.runEntrypointsWatchQueue();
		
	}
	
	async runEntrypointsWatchQueue() {
		
		this.#isEntrypointsWatchQueueRunning = true;
		
		while (this.#entrypointsWatchQueue.size)
			for (const entrypoint of this.values())
				if (this.#entrypointsWatchQueue.has(entrypoint)) {
					await entrypoint.runWatchQueue();
					this.#entrypointsWatchQueue.delete(entrypoint);
					await new Promise(resolve => { setTimeout(resolve, this.#entrypointsWatchQueueDelay); });
				}
		
		this.#isEntrypointsWatchQueueRunning = false;
		
	}
	
	
	static {
		
		setNodePath();
		
		const cwd = process.cwd();
		
		this.getConveyerFiles = args => {
			if (!args.length)
				args.push(cwd);
			
			const conveyerFileNames = [];
			
			for (let fileName of args) {
				if (!path.isAbsolute(fileName))
					fileName = path.resolve(cwd, fileName);
				
				const stats = fs.statSync(fileName, { throwIfNoEntry: false });
				if (stats?.isFile())
					conveyerFileNames.push(fileName);
				else if (stats?.isDirectory()) {
					const dirName = fileName;
					for (const anotherFileName of fs.readdirSync(dirName))
						if (/^\.conveyer\.(?:[cm]?j|t)s$/.test(anotherFileName)) {
							fileName = path.resolve(dirName, anotherFileName);
							conveyerFileNames.push(fileName);
							break;
						}
				} else
					for (const extension of validExtensions) {
						const expectedFileName = `${fileName}.conveyer.${extension}`;
						if (fs.existsSync(expectedFileName)) {
							fileName = expectedFileName;
							conveyerFileNames.push(fileName);
							break;
						}
					}
			}
			
			return conveyerFileNames.length ? conveyerFileNames : null;
		};
		
	}
	
}
