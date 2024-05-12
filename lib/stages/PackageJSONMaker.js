import path from "node:path";
import { isEmpty } from "@nesvet/n";
import fse from "fs-extra";
import { Packages } from "../utils/Packages.js";
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
			description,
			productName,
			type,
			main,
			author,
			license,
			private: _private = true
		} = await fse.readJson(path.resolve(this.src, "package.json"));
		
		const dependencies =
			this.dependencies ?
				typeof this.dependencies == "function" ?
					this.dependencies() :
					this.dependencies :
				this.dependenciesOf ?
					Packages.unite(...this.dependenciesOf.map(stageId => this.conveyerContext[stageId]?.dependencies).filter(Boolean)).asDependencies() :
					null;
		
		await fse.outputJson(path.resolve(this.dest, "package.json"), {
			name,
			version,
			description,
			productName,
			type,
			main,
			author,
			license,
			private: _private,
			dependencies: !isEmpty(dependencies) ? dependencies : undefined,
			...this.overrides
		}, { spaces: "\t" });
		
		const destNodeModulesPath = path.resolve(this.dest, "node_modules");
		
		try {
			if ((await fse.lstat(destNodeModulesPath)).isSymbolicLink())
				await fse.remove(destNodeModulesPath);
		} catch {}
		
		if (this.symlinkNodeModules)
			await fse.ensureSymlink(path.resolve(this.src, "node_modules"), destNodeModulesPath);
		
	}
	
	do = this.make;
	
}
