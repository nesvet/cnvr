import {
	access,
	lstat,
	mkdir,
	readFile,
	rm,
	symlink,
	writeFile
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isEmpty, pick } from "@nesvet/n";
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
		
		const packageJSON = JSON.parse(await readFile(resolve(this.src, "package.json"), "utf8"));
		
		let dependencies =
			typeof this.dependencies == "function" ?
				this.dependencies() :
				this.dependencies;
		
		if (Array.isArray(dependencies)) {
			const knownDependencies = {
				...packageJSON.optionalDependencies,
				...packageJSON.devDependencies,
				...packageJSON.peerDependencies,
				...packageJSON.bundledDependencies,
				...packageJSON.bundleDependencies,
				...packageJSON.dependencies
			};
			
			dependencies = Object.fromEntries(
				dependencies
					.map(packageName => knownDependencies[packageName] && [ packageName, knownDependencies[packageName] ])
					.filter(Boolean)
			);
		}
		
		dependencies = Object.fromEntries(Object.entries({
			...this.dependenciesOf && Packages.unite(...this.dependenciesOf.map(stageId => this.conveyer.context[stageId]?.dependencies).filter(Boolean)).asDependencies(),
			...dependencies
		}).sort(([ a ], [ b ]) => a < b ? -1 : a > b ? 1 : 0));
		
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
		}, null, "\t"));
		
		const destNodeModulesPath = resolve(this.dest, "node_modules");
		
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
