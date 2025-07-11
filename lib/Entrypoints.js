import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { watch } from "chokidar";
import { sleep } from "@nesvet/n";
import "./env.js";
import { log, setNodePath } from "#utils";
import { Entrypoint } from "./Entrypoint.js";


const { FORCE } = process.env;

export const validExtensions = [ "js", "cjs", "mjs", "ts" ];
const fileRegex = new RegExp(`^\\.conveyer\\.(${validExtensions.join("|")})$`);

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
		for (let i = 2, { length } = process.argv; i < length; i++) {
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
					await sleep(this.#entrypointsWatchQueueDelay);
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
			
			for (const input of args) {
				const filePath = isAbsolute(input) ? input : resolve(cwd, input);
				const stats = statSync(filePath, { throwIfNoEntry: false });
				
				if (stats?.isFile()) {
					conveyerFileNames.push(filePath);
					continue;
				}
				
				if (stats?.isDirectory()) {
					let found = false;
					
					for (const fileName of readdirSync(filePath))
						if (fileRegex.test(fileName)) {
							conveyerFileNames.push(resolve(filePath, fileName));
							found = true;
							break;
						}
					
					if (!found)
						for (const extension of validExtensions) {
							const indexPath = resolve(filePath, ".conveyer", `index.${extension}`);
							if (existsSync(indexPath)) {
								conveyerFileNames.push(indexPath);
								break;
							}
						}
					
					continue;
				}
				
				for (const extension of validExtensions) {
					const fallbackPath = `${filePath}.conveyer.${extension}`;
					
					if (existsSync(fallbackPath)) {
						conveyerFileNames.push(fallbackPath);
						break;
					}
				}
			}
			
			return conveyerFileNames.length ? conveyerFileNames : null;
		};
	}
	
}
