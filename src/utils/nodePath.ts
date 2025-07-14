import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { unique } from "@nesvet/n";


export function setNodePath() {
	
	const nodePaths = [];
	
	const cwd = process.cwd();
	
	for (let currentDir = cwd; ;) {
		if (existsSync(join(currentDir, "package.json")))
			nodePaths.push(join(currentDir, "node_modules"));
		
		const parentDir = dirname(currentDir);
		
		if (currentDir === parentDir)
			break;
		
		currentDir = parentDir;
	}
	
	process.env.NODE_PATH = unique([
		...process.env.NODE_PATH?.split(delimiter) ?? [],
		...nodePaths.sort()
	]).join(delimiter);
	
}
