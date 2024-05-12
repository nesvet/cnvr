import path from "node:path";
import anymatch from "anymatch";
import * as esbuild from "esbuild";
import { jscc } from "esbuild-plugin-jscc";
import { Packages } from "#utils/Packages.js";
import { Stage } from "./Stage.js";


const {
	NODE_ENV,
	CONVEYER_TARGET_WD,
	WATCH,
	SOURCEMAPS
} = process.env;


export class ESBuild extends Stage {
	constructor({
		jsx,
		jsxDev,
		alias,
		watch,
		...restOptions
	} = {}) {
		
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
			watch: {
				paths: [],
				events: [ "change" ],
				...watch
			}
		});
		
	}
	
	async handleInited() {
		
		this.buildContext = await esbuild.context({
			absWorkingDir: this.cwd,
			bundle: true,
			entryPoints: this.entryPoints,
			loader: this.loader,
			jsx: this.jsx,
			jsxDev: this.jsxDev,
			external: (
				this.external ?
					this.external === true ?
						this.conveyerContext.packages.asNames() :
						this.external :
					undefined
			)?.filter(
				this.local ?
					packageNameMatcher => !anymatch(this.local, packageNameMatcher) :
					Boolean
			),
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
			isPathsChanged = await this.ensureWatchPaths(Packages.metaFileNames(metafile));
		
		if (isInitial || isPathsChanged)
			this.context.dependencies = this.conveyerContext.packages.metaPick(metafile);
		
		if (!WATCH)
			await this.buildContext.dispose();
		
	}
	
	do = this.build;
	
}
