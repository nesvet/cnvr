import { resolve } from "node:path";
import { Conveyer, ESBuild } from "./src/stages";


const DIST_DIR = "dist";


new Conveyer([
	
	new ESBuild({
		title: "Conveyer",
		entryPoints: [ "src/index.js" ],
		outfile: resolve(DIST_DIR, "index.js"),
		external: true,
		platform: "node",
		format: "esm",
		sourcemap: true,
		target: "node22"
	}),
	
	new ESBuild({
		title: "Zip Worker",
		entryPoints: [ "src/workers/zip.ts" ],
		outfile: resolve(DIST_DIR, "zip-worker.js"),
		external: true,
		platform: "node",
		format: "esm",
		sourcemap: true,
		target: "node22"
	})
	
], {
	initialCleanup: DIST_DIR
});
