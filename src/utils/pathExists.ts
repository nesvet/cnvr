import { access } from "node:fs/promises";


export async function pathExists(path: string) {
	try {
		await access(path);
		
		return true;
	} catch {
		return false;
	}
}
