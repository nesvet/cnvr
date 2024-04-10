import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";
import { jscc } from "esbuild-plugin-jscc";
import { Packages } from "#utils/Packages.js";
import { Stage } from "./Stage.js";


// FIXME


const {
	NODE_ENV,
	CONVEYER_TARGET_WD,
	WATCH,
	SOURCEMAPS
} = process.env;


export class ESBuild extends Stage {
	constructor(options) {
		
		const {
			jsx,
			jsxDev,
			alias,
			localModulePaths,
			watch,
			...restOptions
		} = options;
		
		super({
			symbol: "🔨",
			title: "esbuild",
			mainFields: [ "module", "main" ],
			loader: { ".node": "file" },
			legalComments: NODE_ENV === "production" ? "none" : undefined,
			minify: NODE_ENV === "production",
			treeShaking: NODE_ENV === "production",
			sourcemap: (WATCH || SOURCEMAPS) ? "linked" : undefined,
			color: true,
			...restOptions,
			jsx: jsx === true ? "automatic" : jsx,
			jsxDev: jsxDev || (jsx && NODE_ENV === "development"),
			alias: alias ? Object.fromEntries(Object.entries(alias).map(([ key, value ]) => [ key, path.resolve(value) ])) : undefined,
			localModulePaths: localModulePaths ? localModulePaths.map(localModulePath => path.resolve(localModulePath)) : null,
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
		
		this.buildContext = await esbuild.context({
			absWorkingDir: this.cwd,
			bundle: true,
			entryPoints: this.entryPoints,
			loader: this.loader,
			jsx: this.jsx,
			jsxDev: this.jsxDev,
			external: this.external,
			mainFields: this.mainFields,
			nodePaths: [
				`${CONVEYER_TARGET_WD}/node_modules`,
				...this.nodePaths ?? []
			],
			outfile: this.outfile,
			alias: this.alias,
			define: this.define,
			plugins: [
				this.jsccValues && jscc({
					values: this.jsccValues,
					ignore: this.jsccIgnore,
					sourceMap: !!this.sourcemap
				}),
				...this.plugins ?? []
			].filter(Boolean),
			platform: this.platform,
			format: this.format,
			target: this.target,
			legalComments: this.legalComments,
			minify: this.minify,
			treeShaking: this.treeShaking,
			sourcemap: this.sourcemap,
			color: this.color,
			metafile: true
		});
		
	}
	
	async ensureWatchPaths(watchPaths) {
		if (this.watchPaths.join() !== watchPaths.join()) {
			this.watchPaths = watchPaths;
			if (this.watcher)
				await this.watch();
			
			return true;
		}
		
		return false;
	}
	
	async build(isInitial) {
		
		const { metafile } = await this.buildContext.rebuild();
		
		let isPathsChanged;
		if (WATCH)
			isPathsChanged = await this.ensureWatchPaths(Packages.makeFileNames(metafile));
		
		if (isInitial || isPathsChanged)
			this.context.packages = new Packages({
				metafile,
				localModulePaths: this.localModulePaths,
				externalModules: this.external,
				fileNames: WATCH && this.watchPaths
			});
		
		if (!WATCH)
			await this.buildContext.dispose();
		
	}
	
	do = this.build;
	
}
