import path from "node:path";
import chokidar from "chokidar";
import fse from "fs-extra";


export class Stage {
	constructor({
		watch,
		initialCleanup,
		cwd = process.cwd(),
		...restOptions
	}) {
		
		if (watch) {
			let { paths, events, ...options } = {};
			if (typeof watch == "string")
				paths = [ watch ];
			else if (Array.isArray(watch))
				paths = watch;
			else if (typeof watch == "object")
				({ paths, events, ...options } = watch);
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
	
	pendingWatchEvents = new Map();
	
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
	
	handleWatchEvents = (...args) => {
		
		let name;
		if (args.length > 1)
			name = args.shift();
		const watchPath = args.shift();
		
		this.pendingWatchEvents.delete(watchPath);
		this.pendingWatchEvents.set(watchPath, name);
		
		return this.conveyer.enqueueWatch(this);
	};
	
	async watch() {
		
		if (this.watcher) {
			await this.watcher.close();
			delete this.watcher;
		}
		
		if (this.watchEvents && this.watchPaths) {
			this.watcher = chokidar.watch(this.watchPaths, this.watchOptions);
			
			for (const name of this.watchEvents)
				this.watcher.on(name, this.handleWatchEvents);
			
			this.watcher.on("error", error => console.error(`❗️${this.symbol} ${this.title} watcher ${error.stack}`));
		}
		
		return this.watcher;
	}
	
	async runWatchQueue() {
		
		while (this.pendingWatchEvents.size)
			for (const [ watchPath, name ] of this.pendingWatchEvents) {
				this.pendingWatchEvents.delete(watchPath);
				await this.run(false, watchPath, name);
			}
		
	}
	
}
