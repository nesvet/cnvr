import fs from "node:fs";
import path from "node:path";
import { require } from "#utils/require";


const declarationRegexp = /^[\dA-Z_]+=(?:(["'`])[\S\s]*?(?<!\\)\1|\S+)/gm;
const quotesRegexp = /^(["'`])[\S\s]*\1$/;
const nestedVariablesRegexp = /(?<!\\|\$)\$(?:{([\dA-Z_]+)(?::(-|=)([^}]*))?}|([\dA-Z_]+))/g;

const paramsMap =
	process._conveyerEnv =
		{};

const processArgv = process.argv;

const isProcessArgvIncludesDevelopment = processArgv.includes("--development") || processArgv.includes("-d");
const isProcessArgvIncludesProduction = processArgv.includes("--production") || processArgv.includes("-p");


export function loadEnvFile(fileName, dirName = "") {
	const isAbsolute = path.isAbsolute(fileName);
	const isIncludesDotEnv = fileName.includes(".env");
	const isStartsWithDot = !isAbsolute && fileName.startsWith(".");
	
	for (fileName of [
		...(isAbsolute ? [
			isIncludesDotEnv ? fileName : path.join(fileName, ".env")
		] : [
			path.resolve(dirName, fileName),
			...(isIncludesDotEnv ? [] : isStartsWithDot ? [
				path.resolve(dirName, fileName, ".env"),
				path.resolve(dirName, `${fileName}.env`),
				path.resolve(dirName, `.env${fileName}`)
			] : [
				path.resolve(dirName, `.${fileName}`, ".env"),
				path.resolve(dirName, `.${fileName}.env`),
				path.resolve(dirName, `.env.${fileName}`)
			])
		]),
		null
	])
		if (fileName && fs.statSync(fileName, { throwIfNoEntry: false })?.isFile())
			break;
	
	if (!fileName)
		return false;
	
	const params =
		paramsMap[path.basename(fileName)] =
			{ dir: path.dirname(fs.realpathSync(fileName)), vars: [] };
	
	for (const keyValue of fs.readFileSync(fileName, "utf8").match(declarationRegexp) ?? []) {
		const eqIndex = keyValue.indexOf("=");
		const key = keyValue.slice(0, eqIndex);
		let value = keyValue.slice(eqIndex + 1);
		if (quotesRegexp.test(value))
			value = value.slice(1, -1);
		if (nestedVariablesRegexp.test(value))
			value = value.replaceAll(nestedVariablesRegexp, (_, curlyName, substitutionType, substitution, name) => {
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


export function env(dirName = path.dirname(require.resolve(processArgv[1])), envName) {
	loadEnvFile(path.join(dirName, ".env"));
	
	let isNodeEnvFileLoaded = false;
	if (process.env.NODE_ENV)
		isNodeEnvFileLoaded = loadEnvFile(path.join(dirName, `.${process.env.NODE_ENV}.env`));
	
	let isProductionEnvArg;
	for (let i = 2, { length } = processArgv; i < length; i++)
		switch (processArgv[i]) {
			case "-e":
			case "--env": {
				const envArg = processArgv[++i];
				isProductionEnvArg = envArg.includes("production");
				loadEnvFile(envArg, dirName);
			}
		}
	
	if (process.env.NODE_ENV && !isNodeEnvFileLoaded)
		isNodeEnvFileLoaded = loadEnvFile(path.join(dirName, `.${process.env.NODE_ENV}.env`));
	
	if (envName && loadEnvFile(path.join(dirName, `.${envName}.env`)) && process.env.NODE_ENV && !isNodeEnvFileLoaded)
		isNodeEnvFileLoaded = loadEnvFile(path.join(dirName, `.${process.env.NODE_ENV}.env`));
	
	if (process.env.NODE_ENV === undefined || isProcessArgvIncludesDevelopment || isProcessArgvIncludesProduction) {
		const nodeEnvBefore = process.env.NODE_ENV;
		
		process.env.NODE_ENV =
			isProcessArgvIncludesDevelopment ?
				"development" :
				isProcessArgvIncludesProduction ?
					"production" :
					(process.env.npm_lifecycle_event === "build" || processArgv.includes("--build")) ?
						"production" :
						isProductionEnvArg ?
							"production" :
							"development";
		
		if (!isNodeEnvFileLoaded || process.env.NODE_ENV !== nodeEnvBefore)
			loadEnvFile(path.join(dirName, `.${process.env.NODE_ENV}.env`));
	}
	
}
