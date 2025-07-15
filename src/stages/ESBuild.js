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
			...NODE_ENV === "production" && {
				legalComments: "none",
				minify: true,
				treeShaking: true
			},
			...(WATCH || SOURCEMAPS) && {
				sourcemap: "linked"
			},
			color: true,
			...local && {
				local: Array.isArray(local) ? local : [ local ]
			},
			...restOptions,
			jsx: jsx === true ? "automatic" : jsx,
			jsxDev: jsxDev || (jsx && NODE_ENV === "development"),
			...alias && {
				alias: Object.fromEntries(Object.entries(alias).map(([ key, value ]) => [ key, path.resolve(value) ]))
			},
			watch: {
				paths: [],
				events: [ "change" ],
				...watch
			}
		});
		
	}
	
	async handleInited() {
		
		const external = Array.isArray(this.external) ? this.external.filter(item => typeof item == "string") : [];
		
		this.context.packages = new Packages({
			external,
			local: this.local
		});
		
		if (this.external && (this.external === true || this.external.includes(true)))
			external.push(...this.context.packages.external.asNames());
		
		if (this.define && Object.values(this.define).some(definition => typeof definition == "function"))
			this.define = Object.fromEntries(
				Object.entries(this.define)
					.map(([ key, value ]) => [ key, typeof value == "function" ? value.call(this) : value ])
			);
		
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
		
		
		this.watchPaths = unique(this.entryPoints.map(entryPoint => path.join(path.dirname(entryPoint), "**")));
		
	}
	
	async #ensureWatchPaths(watchPaths) {
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
			isPathsChanged = await this.#ensureWatchPaths(Packages.metaFileNames(metafile));
		
		if (isInitial || isPathsChanged)
			this.context.dependencies = this.context.packages.metaPick(metafile);
		
		if (!WATCH)
			await this.buildContext.dispose();
		
	}
	
	do = this.build;
	
}
