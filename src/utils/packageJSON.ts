import { readFile } from "node:fs/promises";
import { watch, type FSWatcher } from "chokidar";
import type { PackageJson } from "type-fest";


type PackageJSONListener = (packageJSON: PackageJson) => Promise<void> | void;


export const packageJSON: PackageJson = {};

export const packageJSONListeners = new Set<PackageJSONListener>();

async function handlePackageJSONChange() {
	
	Object.assign(packageJSON, JSON.parse(await readFile("package.json", "utf8")));
	
	for (const listener of packageJSONListeners)
		void listener(packageJSON);
	
}

await handlePackageJSONChange();

let packageJSONWatcher: FSWatcher;

export function watchPackageJSON(listener?: PackageJSONListener) {
	
	packageJSONWatcher ??= watch("package.json", {
		ignoreInitial: true,
		awaitWriteFinish: {
			stabilityThreshold: 500,
			pollInterval: 50
		}
	}).on("change", handlePackageJSONChange);
	
	if (listener)
		packageJSONListeners.add(listener);
	
	return packageJSONWatcher;
}
