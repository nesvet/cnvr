import path from "node:path";
import { debounce, sleep } from "@nesvet/n";
import chokidar from "chokidar";
import fse from "fs-extra";
import { log } from "#utils/log.js";


const defaultIgnored = [
	"**/.git/**",
	"**/.devcontainer/**",
	"**/package(-lock)?.json",
	"**/yarn.lock",
	"**/bun.lockb",
	"**/.DS_Store",
	"**/node_modules/**"
];


export class VersionBumper {
	constructor(packagePath) {
		this.filename = /package\.json$/.test(packagePath) ? packagePath : path.join(packagePath, "package.json");
		this.dirname = path.dirname(this.filename);
		
		this.reload();
		
		this.debouncedBump = debounce(() => this.bump(), 1000, { leading: true, trailing: false });
		
	}
	
	async parse() {
		
		const packageJSON = await fse.readFile(this.filename, "utf8");
		
		const { name, version } = JSON.parse(packageJSON);
		
		const [ pre, patch ] = version.match(/^(\d.+\D)(\d+)$/).slice(1);
		
		return {
			packageJSON,
			name,
			version,
			pre,
			patch: parseInt(patch)
		};
	}
	
	async reload(parsed) {
		const { packageJSON, ...rest } = parsed ?? await this.parse();
		
		Object.assign(this, rest);
		
	}
	
	async bump() {
		
		await sleep(100);
		
		try {
			const parsed = await this.parse();
			
			if (this.pre !== parsed.pre)
				await this.reload(parsed);
			
			this.patch++;
			
			if (this.patch - parsed.patch === 1) {
				this.version = `${this.pre}${this.patch}`;
				await fse.writeFile(this.filename, parsed.packageJSON.replace(/(.*"version"\s*:\s*")\d+\.\d+\.\d+/, (_, $1) => `${$1}${this.version}`), "utf8");
			} else {
				this.patch = parsed.patch;
				this.version = parsed.version;
			}
			
			await log(`🚀 ${this.version}`, "info", this.name);
		} catch {}
		
	}
	
	
	static watch(packagePath, options = {}) {
		const { ignored = [] } = options;
		
		const bumper = new VersionBumper(packagePath);
		
		const watcher = chokidar.watch(`${bumper.dirname}/**`, {
			ignored: [ ...defaultIgnored, ...ignored ].map(ignoredPath => path.isAbsolute(ignoredPath) ? ignoredPath : path.resolve(bumper.dirname, ignoredPath)),
			ignoreInitial: true
		});
		
		watcher.on("all", bumper.debouncedBump);
		
		return watcher;
	}
	
}
