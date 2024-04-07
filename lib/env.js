import { env } from "#utils/env.js";


env(process.cwd());

if (process.argv.includes("--force"))
	process.env.FORCE = true;
