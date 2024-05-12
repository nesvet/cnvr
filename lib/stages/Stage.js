import path from "node:path";
import { watch } from "chokidar";
import fse from "fs-extra";


export class Stage {
	constructor({
		watch: watchOptions,
		initialCleanup,
		cwd = process.cwd(),
		...restOptions
	}) {
		
		if (watchOptions) {
			let { paths, events, ...options } = {};
			if (typeof watchOptions == "string")
				paths = [ watchOptions ];
			else if (Array.isArray(watchOptions))
				paths = watchOptions;
			else if (typeof watchOptions == "object")
				({ paths, events, ...options } = watchOptions);
			this.watchPaths = paths?.filter(Boolean).map(watchPath => path.isAbsolute(watchPath) ? watchPath : path.resolve(cwd, watchPath));
			this.watchOptions = options;
			this.watchEvents = events && (Array.isArray(events) ? events : [ events ]);
		}
		
		Object.assign(this, {
			symbol: "🔵",
			initialCleanup: initialCleanup ? (Array.isArray(initialCleanup) ? initialCleanup : [ initialCleanup ]).filter(Boolean) : false,
			cwd,
			...restOptions
		});
		
	}
	
	#pendingWatchEvents = new Map();
	
	handleInited() {
		return this.onInit?.();
	}
	
	async run(isInitial, ...restArgs) {
		try {
			if (isInitial && this.initialCleanup)
				for (const dir of this.initialCleanup)
					await fse.emptyDir(dir);
			
			await this.conveyer.beginStage({
				spinner: this.spinner,
				symbol: this.symbol,
				title: this.title
			});
			
			await this.onBefore?.(isInitial, ...restArgs);
			await this.do(isInitial, ...restArgs);
			await this.onAfter?.(isInitial, ...restArgs);
			
			await this.conveyer.doneStage();
			
			return true;
		} catch (error) {
			console.error(`❗️${this.symbol} ${this.title} ${error.stack}`);
			
			return false;
		}
	}
	
	#handleWatchEvents = (eventName, watchPath) => {
		this.#pendingWatchEvents.set(watchPath, eventName);
		
		return this.conveyer.enqueueWatch(this);
	};
	
	async watch() {
		
		if (this.watcher) {
			await this.watcher.close();
			delete this.watcher;
		}
		
		if (this.watchEvents && this.watchPaths) {
			this.watcher = watch(this.watchPaths, {
				awaitWriteFinish: {
					stabilityThreshold: 100,
					pollInterval: 10
				},
				...this.watchOptions
			});
			
			for (const name of this.watchEvents)
				this.watcher.on(
					name,
					name === "all" ?
						this.#handleWatchEvents :
						(...args) => this.#handleWatchEvents(name, ...args)
				);
			
			this.watcher.on("error", error => console.error(`❗️${this.symbol} ${this.title} watcher ${error.stack}`));
		}
		
		return this.watcher;
	}
	
	async runWatchQueue() {
		
		while (this.#pendingWatchEvents.size) {
			const eventMap = [ ...this.#pendingWatchEvents ];
			this.#pendingWatchEvents.clear();
			await this.run(false, eventMap);
		}
		
	}
	
}
