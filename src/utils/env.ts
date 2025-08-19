import { readFileSync, realpathSync, statSync } from "node:fs";
import {
	basename,
	dirname,
	isAbsolute,
	resolve
} from "node:path";
import { Packages } from "#utils";


declare global {
	namespace NodeJS {// eslint-disable-line @typescript-eslint/no-namespace
		interface Process {
			_conveyerEnv: Record<string, Params>;
		}
	}
}

type Params = { dir: string; vars: string[] };

type ParseResult = Record<string, string>;


process._conveyerEnv = {};

const paramsMap = process._conveyerEnv;

const loadedFilePaths = new Set<string>();

const MAX_INTERPOLATION_PASSES = 10;

function findUnquotedHash(value: string): number {
	
	let inQuotes = false;
	let quoteChar = "";
	let escaped = false;
	
	for (let i = 0; i < value.length; i++) { // eslint-disable-line unicorn/no-for-loop
		const char = value[i];
		
		if (escaped) {
			escaped = false;
			
			continue;
		}
		
		if (char === "\\") {
			escaped = true;
			
			continue;
		}
		
		if (!inQuotes && (char === '"' || char === "'")) {
			inQuotes = true;
			quoteChar = char;
		} else if (inQuotes && char === quoteChar) {
			inQuotes = false;
			quoteChar = "";
		} else if (!inQuotes && char === "#")
			return i;
	}
	
	return -1;
}

function parseMultiline(lines: string[], startIndex: number, quote: "'''" | '"""') {
	const firstLine = lines[startIndex];
	
	const valueStartIndex = firstLine.indexOf("=") + 1;
	
	const content = firstLine.slice(valueStartIndex).trim().slice(3);
	
	if (content.endsWith(quote))
		return {
			value: content.slice(0, -quote.length),
			foundClosing: true,
			nextIndex: startIndex + 1
		};
	
	const valueParts = [ content ];
	let currentIndex = startIndex;
	
	while (++currentIndex < lines.length) {
		const nextLine = lines[currentIndex];
		
		if (nextLine.trim().endsWith(quote)) {
			valueParts.push(nextLine.trim().slice(0, -quote.length));
			
			return {
				value: valueParts.join("\n"),
				foundClosing: true,
				nextIndex: currentIndex + 1
			};
		}
		
		valueParts.push(nextLine);
	}
	
	return {
		value: firstLine.slice(valueStartIndex).trim(),
		foundClosing: false,
		nextIndex: currentIndex
	};
}

function interpolateVariables(parsed: ParseResult): ParseResult {
	let result: ParseResult = { ...parsed };
	let passes = 0;
	
	const unresolvedVarRegex = /\${([^}]+)}|\$([A-Z_a-z]\w*)/;
	
	while (passes < MAX_INTERPOLATION_PASSES) {
		passes++;
		const stateBeforePass = JSON.stringify(result);
		
		const newResult: ParseResult = {};
		
		for (const [ key, value ] of Object.entries(result)) {
			if (!value.includes("$")) {
				newResult[key] = value;
				continue;
			}
			
			const newValue = value.replaceAll(/\${([^}]+)}|\$([A-Z_a-z]\w*)/g, (match, braced, unbraced) => { // eslint-disable-line no-loop-func
				const varNameWithDefault = braced || unbraced;
				
				let varName = varNameWithDefault;
				let defaultValue: string | undefined;
				const separatorIndex = varNameWithDefault.indexOf(":-");
				
				if (separatorIndex !== -1) {
					defaultValue = varNameWithDefault.slice(separatorIndex + 2);
					varName = varNameWithDefault.slice(0, separatorIndex);
				}
				
				const resolvedValue = result[varName] ?? process.env[varName];
				
				if (resolvedValue !== undefined)
					return resolvedValue;
				
				if (defaultValue !== undefined)
					return defaultValue;
				
				throw new Error(`Undefined variable '${varName}' in value for key '${key}'`);
			});
			
			newResult[key] = newValue;
		}
		
		result = newResult;
		
		const stateAfterPass = JSON.stringify(result);
		
		if (stateBeforePass === stateAfterPass) {
			if (unresolvedVarRegex.test(stateAfterPass))
				throw new Error("Interpolation cycle detected");
			
			return result;
		}
	}
	
	throw new Error(`Interpolation cycle detected or max passes (${MAX_INTERPOLATION_PASSES}) exceeded.`);
}

function parse(content: string): ParseResult {
	
	const result: ParseResult = {};
	const lines = content.split(/\r?\n/);
	let i = 0;
	
	while (i < lines.length) {
		let line = lines[i].trim();
		
		if (!line || line.startsWith("#")) {
			i++;
			
			continue;
		}
		
		if (line.startsWith("export "))
			line = line.slice(7).trim();
		
		const eqIndex = line.indexOf("=");
		
		if (eqIndex === -1)
			throw new Error(`Invalid line without '=' at line ${i + 1}`);
		
		const key = line.slice(0, eqIndex).trim();
		
		if (!key || !/^[A-Z_a-z]\w*$/.test(key))
			throw new Error(`Invalid key '${key}' at line ${i + 1}`);
		
		let value = line.slice(eqIndex + 1).trim();
		
		if (value.startsWith('"""') || value.startsWith("'''")) {
			const quote = value.slice(0, 3) as "'''" | '"""';
			
			const multi = parseMultiline(lines, i, quote);
			
			if (multi.foundClosing)
				({ value } = multi);
			else
				throw new Error(`Unclosed triple quotes for key '${key}' starting at line ${i + 1}`);
			
			i = multi.nextIndex;
		} else {
			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
				const [ quote ] = value;
				value = value.slice(1, -1);
				
				value =
					quote === '"' ?
						value
							.replaceAll(String.raw`\n`, "\n")
							.replaceAll(String.raw`\r`, "\r")
							.replaceAll(String.raw`\t`, "\t")
							.replaceAll(String.raw`\v`, "\v")
							.replaceAll(String.raw`\b`, "\b")
							.replaceAll(String.raw`\f`, "\f")
							.replaceAll(String.raw`\"`, '"')
							.replaceAll(String.raw`\\`, "\\") :
						value
							.replaceAll(String.raw`\'`, "'")
							.replaceAll(String.raw`\\`, "\\");
			} else {
				const hashIndex = findUnquotedHash(value);
				
				if (hashIndex !== -1)
					value = value.slice(0, hashIndex).trim();
				
				value = value.replaceAll(String.raw`\#`, "#");
			}
			
			i++;
		}
		
		result[key] = value;
	}
	
	return interpolateVariables(result);
}

function loadOne(candidates: string[]) {
	let filePath = candidates.find(candidate => statSync(candidate, { throwIfNoEntry: false })?.isFile());
	
	if (!filePath)
		return;
	
	filePath = realpathSync(filePath);
	
	if (loadedFilePaths.has(filePath))
		return;
	
	loadedFilePaths.add(filePath);
	
	try {
		let content = readFileSync(filePath, "utf8");
		
		if (content.codePointAt(0) === 0xfeff)
			content = content.slice(1);
		
		const parsed = parse(content);
		
		const params: Params =
				paramsMap[basename(filePath)] = {
					dir: dirname(filePath),
					vars: Object.keys(parsed)
				};
		
		for (const [ key, value ] of Object.entries(parsed)) {
			process.env[key] = value;
			params.vars.push(key);
		}
	} catch (error) {
		throw new Error(`Failed to parse environment variables in ${filePath}`, { cause: error });
	}
}

function load(name: string, dirName = "") {
	
	const candidates = (
		name ?
			isAbsolute(name) ?
				[ name ] :
				(
					/\.env(?:\W|$)|(?:\W|^)env\./.test(name) ? [
						name,
						...name.startsWith(".") ? [] : [ `.${name}` ]
					] : [
						`${name}.env`,
						...name.startsWith(".") ? [] : [ `.${name}.env` ],
						`.env.${name}`
					]
				).map(fileName => resolve(dirName, fileName)) :
			[ resolve(dirName, ".env") ]
	);
	
	loadOne(candidates);
	
	loadOne(candidates.map(candidate => `${candidate}.local`));
	
}


export function env(dirName = Packages.getClosestPackageDir(process.argv[1]), envName?: string) {
	
	const { argv } = process;
	
	load("", dirName);
	
	const initialNodeEnv = process.env.NODE_ENV;
	const isDevFlag = argv.includes("--development") || argv.includes("-d");
	const isProdFlag = argv.includes("--production") || argv.includes("-p");
	const isBuildCommand = process.env.npm_lifecycle_event === "build" || argv.includes("--build");
	
	let determinedNodeEnv = initialNodeEnv;
	
	if (!determinedNodeEnv || isDevFlag || isProdFlag)
		if (isDevFlag)
			determinedNodeEnv = "development";
		else if (isProdFlag)
			determinedNodeEnv = "production";
		else if (isBuildCommand)
			determinedNodeEnv = "production";
		else
			determinedNodeEnv = "development";
	
	if (determinedNodeEnv)
		load(determinedNodeEnv, dirName);
	
	for (let i = 2; i < argv.length; i++)
		if ((argv[i] === "-e" || argv[i] === "--env") && argv[i + 1])
			load(argv[++i], dirName);
	
	if (envName)
		load(envName, dirName);
	
	process.env.NODE_ENV = determinedNodeEnv;
	
}
