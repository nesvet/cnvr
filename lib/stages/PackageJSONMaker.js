import path from "node:path";
import fse from "fs-extra";
import { Stage } from "./Stage.js";


const { DEV } = process.env;


export class PackageJSONMaker extends Stage {
	constructor(options = {}) {
		super({
			symbol: "📃",
			title: "package.json",
			src: process.env.PWD,
			symlinkNodeModules: !!DEV,
			watch: {
				events: [ "change" ],
				...options.watch
			},
			...options
		});
		
		this.src = this.src.replace(/package\.json$/, "");
		this.dest = this.dest.replace(/package\.json$/, "");
		
	}
	
	async make() {
		
		const {
			name,
			version,
			type,
			productName,
			description,
			license,
			author,
			main,
			private: _private
		} = await fse.readJson(path.resolve(this.src, "package.json"));
		
		const dependencies = typeof this.dependencies == "function" ? this.dependencies() : this.dependencies;
		
		await fse.outputJson(path.resolve(this.dest, "package.json"), {
			name,
			version,
			type,
			productName,
			description,
			license,
			author,
			main,
			dependencies: dependencies && Object.keys(dependencies).length ? dependencies : undefined,
			private: _private,
			...this.overrides
		}, { spaces: "\t" });
		
		const destNodeModulesPath = path.resolve(this.dest, "node_modules");
		
		if (this.symlinkNodeModules)
			await fse.ensureSymlink(path.resolve(this.src, "node_modules"), destNodeModulesPath);
		else
			try {
				if ((await fse.lstat(destNodeModulesPath)).isSymbolicLink())
					await fse.remove(destNodeModulesPath);
			} catch {}
		
	}
	
	do = this.make;
	
}
