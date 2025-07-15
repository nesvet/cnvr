import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { noop } from "@nesvet/n";


/* eslint-disable @typescript-eslint/prefer-promise-reject-errors */


export async function reveal(path: string) {
	path = resolvePath(path);
	
	if (!existsSync(path))
		return console.error("Path does not exist:", path);
	
	try {
		await new Promise<void>((resolve, reject) => {
			
			switch (process.platform) {
				case "win32":
					spawn("explorer", [ "/select,", path ])
						.on("error", reject)
						.on("exit", resolve);
					break;
				
				case "darwin":
					spawn("open", [ "-R", path ])
						.on("error", reject)
						.on("exit", resolve);
					break;
				
				case "linux":
					void (async () => {
						
						const dir = statSync(path).isDirectory() ? path : dirname(path);
						
						for (const [ cmd, ...args ] of [
							[ "nautilus", "--select", path ],
							[ "dolphin", "--select", path ],
							[ "nemo", dir ],
							[ "thunar", dir ],
							[ "xdg-open", dir ]
						])
							try {
								await once(spawn(cmd, args).on("error", noop), "exit");
								
								return resolve();
							} catch {}
						
						reject();
						
					})();
					break;
				
				default:
					reject();
			}
			
		});
	} catch {
		console.log(path);
	}
	
}
