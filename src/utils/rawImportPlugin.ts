import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "esbuild";


export const rawImportPlugin = (): Plugin => ({
	name: "raw-import",
	setup(build) {
		build.onResolve({ filter: /\?raw$/ }, args => ({
			path: resolve(args.resolveDir, args.path.slice(0, -4)),
			namespace: "raw-import"
		}));
		
		build.onLoad({ filter: /.*/, namespace: "raw-import" }, async args => ({
			contents: await readFile(args.path, "utf8"),
			loader: "text",
			watchFiles: [ args.path ]
		}));
	}
});
