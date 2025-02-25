import path from "node:path";
import * as esbuild from "esbuild";
import { jscc } from "esbuild-plugin-jscc";
import { unique } from "@nesvet/n";
import { Packages } from "#utils";
import { Stage } from "./Stage.js";


const {
	NODE_ENV,
	WATCH,
	SOURCEMAPS
} = process.env;


export class ESBuild extends Stage {
	constructor({
		jsx,
		jsxDev,
		alias,
		watch,
		local,
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
			...local && {
				local: Array.isArray(local) ? local : [ local ]
			},
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
	
	#packages;
	
	async handleInited() {
		
		this.watchPaths = unique(this.entryPoints.map(entryPoint => path.join(path.dirname(entryPoint), "**")));
		
		this.#packages = new Packages({
			external,
			local: this.local
		});
		
		if (this.external === true || this.external.includes(true))
			external.push(...this.#packages.external.asNames());
		
		
		this.buildContext = await esbuild.context({
			absWorkingDir: this.cwd,
			bundle: true,
			entryPoints: this.entryPoints,
			loader: this.loader,
			jsx: this.jsx,
			jsxDev: this.jsxDev,
			external,
			mainFields: this.mainFields,
			nodePaths: [
				...process.env.NODE_PATH?.split(path.delimiter) ?? [],
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
		if (this.watchPaths.join(",") !== watchPaths.join(",")) {
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
			this.context.dependencies = this.#packages.metaPick(metafile);
		
		if (!WATCH)
			await this.buildContext.dispose();
		
	}
	
	do = this.build;
	
}
