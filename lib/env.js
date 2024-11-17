import { env } from "#utils/env";


env(process.cwd());

if (process.argv.includes("--force") || process.argv.includes("-f"))
	process.env.FORCE = true;
