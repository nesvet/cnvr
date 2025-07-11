import {
	copyFile,
	mkdir,
	readdir,
	stat
} from "node:fs/promises";
import { join } from "node:path";


export async function copyRecursive(src, dest) {
	if ((await stat(src)).isDirectory()) {
		await mkdir(dest, { recursive: true });
		await Promise.all((await readdir(src)).map(entry => copyRecursive(join(src, entry), join(dest, entry))));
	} else
		await copyFile(src, dest);
	
}
