import {
	access,
	lstat,
	mkdir,
	readFile,
	rm,
	symlink,
	writeFile
} from "node:fs/promises";
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
		
		await mkdir(resolve(this.dest), { recursive: true });
		
		await writeFile(resolve(this.dest, "package.json"), JSON.stringify({
			...pick(packageJSON, [
				"name",
				"version",
				"description",
				"productName",
				"type",
				"main",
				"module",
				"author",
				"license",
				"private"
			]),
			...!isEmpty(dependencies) && { dependencies },
			...this.overrides
		}, { spaces: "\t" });
		
		const destNodeModulesPath = path.resolve(this.dest, "node_modules");
		
		try {
			if ((await lstat(destNodeModulesPath)).isSymbolicLink())
				await rm(destNodeModulesPath, { recursive: true, force: true });
		} catch {}
		
		if (this.symlinkNodeModules) {
			// TODO: Possibly needed to symlink each "external" package individually because of possible monorepo structure
			
			let nmDir = this.src;
			while (true) {
				const checkPath = join(nmDir, "node_modules");
				try {
					await access(checkPath);
					break;
				} catch {
					nmDir += "/..";
					const dir = resolve(nmDir);
					if (dirname(dir) === dir) {
						nmDir = null;
						break;
					}
				}
			}
			if (nmDir)
				await symlink(resolve(nmDir, "node_modules"), destNodeModulesPath, "junction");
			else
				console.warn(`node_modules wasn't symlinked to ${destNodeModulesPath}`);
		}
		
	}
	
	do = this.make;
	
}
