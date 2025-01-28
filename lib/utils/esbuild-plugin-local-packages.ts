import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import anymatch from "anymatch";
import globrex from "globrex";
import resolvePackagePath from "resolve-package-path";
import type { PluginBuild } from "esbuild";


export function localPackages(packages: string[]) {
	return {
		name: "esbuild-plugin-local-packages",
		setup: (build: PluginBuild) => {
			build.onResolve({
				filter: new RegExp(`^(${packages.map(glob => globrex(glob).regex.source.replace(/^\^(.*)\$$/, "$1")).join("|")})`)
			}, async args => {
				
				try {
					let path;
					
					const [ , packageName, subPath ] = args.path.match(/^(@[\da-z-]+\/[\da-z-]+|[\da-z-]+)(\/.*)?$/)!;
					
					const packageJSONPath = resolvePackagePath(packageName, args.resolveDir);
					
					if (packageJSONPath) {
						const packagePath = dirname(packageJSONPath);
						const { exports, main, module } = JSON.parse(await readFile(packageJSONPath, "utf8"));
						
						if (subPath) {
							if (exports)
								for (const [ exportPath, realPath ] of Object.entries(exports) as [ string, string ][])
									if (anymatch(exportPath, subPath))
										path = join(packagePath, realPath);
						} else
							path = join(packagePath, module ?? main);
						
						return {
							path,
							external: false
						};
					}
					
					throw new Error(`Can't resolve ${packageName} in ${args.resolveDir}`);
				} catch (error) {
					console.warn(error);
				}
				
				return null;
			});
			
		}
	};
}

