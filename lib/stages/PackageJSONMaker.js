import path from "node:path";
import fse from "fs-extra";
import { isEmpty } from "@nesvet/n";
import { Packages } from "../utils/Packages.js";
import { Stage } from "./Stage.js";


const { DEV, PWD } = process.env;


export class PackageJSONMaker extends Stage {
	constructor(options = {}) {
		super({
			symbol: "📃",
			title: "package.json",
			src: PWD,
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
			module,
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
					Packages.unite(...this.dependenciesOf.map(stageId => this.conveyer.context[stageId]?.dependencies).filter(Boolean)).asDependencies() :
					null;
		
		await fse.outputJson(path.resolve(this.dest, "package.json"), {
			name,
			version,
			description,
			productName,
			type,
			main,
			module,
			author,
			license,
			private: _private,
			dependencies: isEmpty(dependencies) ? undefined : dependencies,
			...this.overrides
		}, { spaces: "\t" });
		
		const destNodeModulesPath = path.resolve(this.dest, "node_modules");
		
		try {
			if ((await fse.lstat(destNodeModulesPath)).isSymbolicLink())
				await fse.remove(destNodeModulesPath);
		} catch {}
		
		if (this.symlinkNodeModules) {
			// TODO: Possibly needed to symlink each "external" package individually because of possible monorepo structure
			
			let nmDir = this.src;
			while (!fse.existsSync(path.join(nmDir, "node_modules"))) {
				nmDir += "/..";
				const dir = path.resolve(nmDir);
				if (path.dirname(dir) === dir)
					nmDir = null;
			}
			if (nmDir)
				await fse.ensureSymlink(path.resolve(nmDir, "node_modules"), destNodeModulesPath);
			else
				console.warn(`node_modules wasn't symlinked to ${destNodeModulesPath}`);
		}
		
	}
	
	do = this.make;
	
}
