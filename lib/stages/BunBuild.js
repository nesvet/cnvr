import fs from "node:fs";
import path from "node:path";
// import * as esbuild from "esbuild";
// import { jscc } from "esbuild-plugin-jscc";
// import { Packages } from "#utils";
import { Stage } from "./Stage.js";


/* global Bun */


const {
	NODE_ENV,
	WATCH,
	SOURCEMAPS
} = process.env;


export class BunBuild extends Stage {
	constructor(options) {
		
		const {
			// localModulePaths,
			watch,
			...restOptions
		} = options;
		
		super({
			symbol: "🥯",
			title: "Bun.build",
			loader: { ".node": "file" },
			minify: NODE_ENV === "production",
			sourcemap: Boolean(WATCH || SOURCEMAPS),
			...restOptions,
			// localModulePaths:
			// 	localModulePaths ?
			// 		localModulePaths.map(localModulePath => path.resolve(localModulePath)) :
			// 	null,
			watch: {
				paths: [],
				events: [ "change" ],
				...watch
			}
		});
		
		const {
			dependencies,
			devDependencies,
			peerDependencies
		} = JSON.parse(fs.readFileSync(path.resolve(this.cwd, "package.json"), "utf8"));
		
		if (peerDependencies) {
			this.external ??= [];
			for (const packageName of Object.keys(peerDependencies))
				if (!dependencies?.[packageName] && (NODE_ENV !== "development" || !devDependencies?.[packageName]))
					this.external.push(packageName);
		}
		
	}
	
	async handleInited() {
		
		// this.buildContext = await esbuild.context({
		// 	absWorkingDir: this.cwd,
		// 	bundle: true,
		// 	entryPoints: this.entryPoints,
		// 	loader: this.loader,
		// 	jsx: this.jsx,
		// 	jsxDev: this.jsxDev,
		// 	external: this.external,
		// 	mainFields: this.mainFields,
		// 	outfile: this.outfile,
		// 	alias: this.alias,
		// 	define: this.define,
		// 	plugins: [
		// 		this.jsccValues && jscc({
		// 			values: this.jsccValues,
		// 			ignore: this.jsccIgnore,
		// 			sourceMap: !!this.sourcemap
		// 		}),
		// 		...this.plugins ?? []
		// 	].filter(Boolean),
		// 	platform: this.platform,
		// 	format: this.format,
		// 	target: this.target,
		// 	legalComments: this.legalComments,
		// 	minify: this.minify,
		// 	treeShaking: this.treeShaking,
		// 	sourcemap: this.sourcemap,
		// 	color: this.color,
		// 	metafile: true
		// });
		
	}
	
	// async ensureWatchPaths(watchPaths) {
	// 	if (this.watchPaths.join() !== watchPaths.join()) {
	// 		this.watchPaths = watchPaths;
	// 		if (this.watcher)
	// 			await this.watch();
	
	// 		return true;
	// 	}
	
	// 	return false;
	// }
	
	async build(/* isInitial */) {
		
		/* const output =  */await Bun.build({
			entrypoints: this.entrypoints,
			outdir: this.outdir,
			target: this.target,
			format: this.format,
			splitting: this.splitting,
			plugins: this.plugins,
			sourcemap:
				typeof this.sourcemap == "string" ?
					this.sourcemap :
					this.sourcemap ?
						"external" :
						"none",
			minify: this.minify,
			external: this.external,
			naming: this.naming,
			root: this.root,
			publicPath: this.publicPath,
			define: this.define,
			loader: this.loader,
			manifest: WATCH
		});
		
		// const { metafile } = await this.buildContext.rebuild();
		
		// let isPathsChanged;
		// if (WATCH)
		// 	isPathsChanged = await this.ensureWatchPaths(Packages.makeFileNames(metafile));
		
		// if (isInitial || isPathsChanged)
		// 	this.context.packages = new Packages({
		// 		metafile,
		// 		localModulePaths: this.localModulePaths,
		// 		externalModules: this.external,
		// 		fileNames: WATCH && this.watchPaths
		// 	});
		
	}
	
	do = this.build;
	
}
