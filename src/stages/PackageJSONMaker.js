import {
	mkdir,
	readFile,
	rm,
	symlink,
	writeFile
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
		
		await mkdir(resolve(this.dest), { recursive: true });
		
		const packageJSON = JSON.parse(await readFile(resolve(this.src, "package.json"), "utf8"));
		
		let dependencies = {};
		
		if (this.dependenciesOf)
			for (const stageId of this.dependenciesOf) {
				const stage = this.conveyer.context[stageId];
				
				if (stage)
					for (const { name, version } of stage.dependencies.values())
						dependencies[name] = version;
				else
					console.warn(`[PackageJSONMaker] Unknown stage "${stageId}"`);
			}
		
		if (this.dependencies) {
			new Packages();/* To scan `process.cwd()` to fill `Packages.all` */
			
			for (const name of typeof this.dependencies == "function" ? this.dependencies() : this.dependencies)
				try {
					dependencies[name] = Packages.all.get(name).version;
				} catch {
					console.warn(`[PackageJSONMaker] Unknown dependency "${name}"`);
				}
		}
		
		dependencies = Object.fromEntries(Object.entries(dependencies).sort(([ a ], [ b ]) => a < b ? -1 : a > b ? 1 : 0));
		
		if (this.symlinkNodeModules) {
			const nodeModules = resolve(this.dest, "node_modules");
			
			try {
				await rm(nodeModules, { recursive: true, force: true });
			} catch {}
			
			await mkdir(nodeModules, { recursive: true });
			
			for (const name of Object.keys(dependencies)) {
				const sourcePath = Packages.all.get(name).path;
				const destPath = resolve(nodeModules, name);
				
				try {
					await mkdir(dirname(destPath), { recursive: true });
					await symlink(sourcePath, destPath, "junction");
				} catch (error) {
					console.warn(`[PackageJSONMaker] Could not symlink dependency "${name}": ${error.message}`);
				}
			}
		}
		
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
		
	}
	
	do = this.make;
	
}
