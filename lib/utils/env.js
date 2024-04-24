import fs from "node:fs";
import path from "node:path";
import { require } from "#utils/require.js";


const declarationRegexp = /^[A-Z0-9_]+=(?:('|"|`)[\s\S]*?(?<!\\)\1|\S+)/gm;
const quotesRegexp = /^('|"|`)[\s\S]*\1$/;
const nestedVariablesRegexp = /(?<!\\|\$)\$(?:\{([A-Z0-9_]+)(?::(-|=)([^}]*))?\}|([A-Z0-9_]+))/g;

const paramsMap =
	process._conveyerEnv =
		{};

function loadEnvFile(fileName, dirName) {
	const originalFileName = path.isAbsolute(fileName) ? fileName : path.resolve(dirName, fileName);
	
	if (!fs.existsSync(fileName) || !fs.statSync(fileName).isFile())
		fileName = path.resolve(originalFileName, ".env");
	
	if (!fs.existsSync(fileName) || !fs.statSync(fileName).isFile())
		fileName = `${originalFileName}.env`;
	
	if (!fs.existsSync(fileName) || !fs.statSync(fileName).isFile())
		return false;
	
	const params =
		paramsMap[path.basename(fileName)] =
			{ dir: path.dirname(fs.realpathSync(fileName)), vars: [] };
	
	for (const keyValue of fs.readFileSync(fileName, "utf8").match(declarationRegexp) ?? []) {
		const eqIndex = keyValue.indexOf("=");
		const key = keyValue.slice(0, eqIndex);
		let value = keyValue.slice(eqIndex + 1);
		if (quotesRegexp.test(value))
			value = value.slice(1, value.length - 1);
		if (nestedVariablesRegexp.test(value))
			value = value.replace(nestedVariablesRegexp, (_, curlyName, substitutionType, substitution, name) => {
				if (curlyName)
					name = curlyName;
				
				if (name in process.env)
					return process.env[name];
				
				switch (substitutionType) {
					case "=":
						process.env[name] = substitution;
						params.vars.push(name);
					
					case "-":// eslint-disable-line no-fallthrough
						
						return substitution;
					
					default:
						console.warn(`Environment variable ${name} is not defined (used by variable ${key} in ${fileName})`);
						
						return "";
				}
			});
		process.env[key] = value;
		params.vars.push(key);
	}
	
	return true;
}


export function env(dirName = path.dirname(require.resolve(process.argv[1])), envName) {
	loadEnvFile(path.join(dirName, ".env"));
	
	let isNodeEnvFileLoaded = false;
	if (process.env.NODE_ENV)
		isNodeEnvFileLoaded = loadEnvFile(path.join(dirName, `.${process.env.NODE_ENV}.env`));
	
	if (envName)
		if (loadEnvFile(path.join(dirName, `.${envName}.env`)))
			if (process.env.NODE_ENV && !isNodeEnvFileLoaded)
				isNodeEnvFileLoaded = loadEnvFile(path.join(dirName, `.${process.env.NODE_ENV}.env`));
	
	const envArg =
		process.argv.includes("--env") ?
			process.argv[process.argv.indexOf("--env") + 1] :
			process.argv.includes("-e") ?
				process.argv[process.argv.indexOf("-e") + 1] :
				null;
	
	if (envArg)
		if (loadEnvFile(envArg, dirName))
			if (process.env.NODE_ENV && !isNodeEnvFileLoaded)
				isNodeEnvFileLoaded = loadEnvFile(path.join(dirName, `.${process.env.NODE_ENV}.env`));
	
	if (process.env.NODE_ENV === undefined || process.argv.includes("--development") || process.argv.includes("--production")) {
		process.env.NODE_ENV =
			process.argv.includes("--development") ?
				"development" :
				process.argv.includes("--production") ?
					"production" :
					(process.env.npm_lifecycle_event === "build" || process.argv.includes("--build")) ?
						"production" :
						envArg?.includes("production") ?
							"production" :
							"development";
		
		if (!isNodeEnvFileLoaded)
			loadEnvFile(path.join(dirName, `.${process.env.NODE_ENV}.env`));
	}
	
}
