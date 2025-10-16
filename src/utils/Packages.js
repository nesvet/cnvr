import childProcess from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { compareVersions, satisfies } from "compare-versions";
import micromatch from "micromatch";
import resolvePackagePath from "resolve-package-path";
import { getPath, noop, setPath } from "@nesvet/n";


const nodeModulesRegExp = /\/node_modules\//;

const nameBaseRegExp = /(?:@[\da-z~-][\d._a-z~-]*\/)?[\da-z~-][\d._a-z~-]*/;

const nameRegExp = new RegExp(`^${nameBaseRegExp.source}$`);

const trimExportsRegExp = new RegExp(`^(${nameBaseRegExp.source})/.+$`);

const packageJSONCache = new Map();


class Package {
	constructor({
		name,
		version,
		path: packagePath,
		props,
		isSource,
		isLocal,
		...restPackageJSON
	}) {
		
		Object.assign(this, {
			name,
			version,
			path: packagePath,
			...isSource ?
				{ isSource } :
				isLocal ?
					{ isLocal } :
					{ isExternal: true }
		});
		
		if (props)
			for (const prop of props) {
				const value = getPath(restPackageJSON, prop);
				
				if (value)
					setPath(this, prop, value);
			}
		
		Packages.all.set(name, this);
		
	}
	
	async rebuild() {
		
		for (const scriptName of [ "prebuild", "build", "postbuild" ])
			if (this.scripts[scriptName])
				await new Promise((resolve, reject) => {
					
					const [ command, ...args ] = this.scripts[scriptName].split(/\s+/);
					
					childProcess.spawn(command, args, { cwd: this.path })
						.on("exit", resolve)
						.on("error", reject);
					
				});
		
	}
	
	bumpVersion() {
		return Package.bumpVersion(this);
	}
	
	// Temporary off
	static bumpVersion = noop;
	
}

function parse(packagePath, options, isSource) {
	
	if (isSource)
		options.sourcePath = packagePath;
	
	const {
		map,
		localMatcher,
		externalMatcher,
		dev: isDev,
		optional: isOptional,
		peer: isPeer,
		props,
		unresolvedDependencies,
		versionMismatches
	} = options;
	
	const {
		name,
		dependencies,
		devDependencies,
		optionalDependencies,
		peerDependencies,
		...restPackageJSON
	} = Packages.getParsedPackageJSON(path.join(packagePath, "package.json"));
	
	if (!map.has(name)) {
		const isLocal = localMatcher?.(name) || (!nodeModulesRegExp.test(packagePath) && !externalMatcher?.(name));
		
		const pkg = new Package({
			name,
			...restPackageJSON,
			path: packagePath,
			props,
			isSource,
			isLocal
		});
		
		map.set(name, pkg);
		
		if (isSource || isLocal) {
			const declaredDependencies = {
				...dependencies,
				...isDev && devDependencies,
				...isOptional && optionalDependencies,
				...isPeer && peerDependencies
			};
			
			for (const dependencyName of Object.keys(declaredDependencies)) {
				const dependencyPackageJSONPath = resolvePackagePath(dependencyName, packagePath);
				
				if (dependencyPackageJSONPath) {
					const declaredVersionRange = declaredDependencies[dependencyName];
					const actualVersion = Packages.getParsedPackageJSON(dependencyPackageJSONPath).version;
					
					if (declaredVersionRange && actualVersion)
						try {
							if (!satisfies(actualVersion, declaredVersionRange))
								versionMismatches.push({
									consumer: name,
									dependency: dependencyName,
									declared: declaredVersionRange,
									actual: actualVersion
								});
						} catch {}
					
					parse(path.dirname(dependencyPackageJSONPath), options);
				} else
					unresolvedDependencies.set(dependencyName, name);
			}
		}
	}
	
}

function sortPackages(a, b) {
	return a.name > b.name ? 1 : b.name > a.name ? -1 : 0;
}


export class PackageMap extends Map {
	
	#local = null;
	get local() {
		return (this.#local ??= new PackageMap([ ...this.entries() ].filter(([ , pkg ]) => pkg.isLocal)));
	}
	
	#external = null;
	get external() {
		return (this.#external ??= new PackageMap([ ...this.entries() ].filter(([ , pkg ]) => pkg.isExternal)));
	}
	
	#sources = null;
	get sources() {
		return (this.#sources ??= new PackageMap([ ...this.entries() ].filter(([ , pkg ]) => pkg.isSource)));
	}
	
	pick(packageNames) {
		
		const picked = new PackageMap();
		
		for (const packageName of packageNames) {
			const pkg = this.get(packageName);
			if (pkg)
				picked.set(pkg.name, pkg);
		}
		
		return picked;
	}
	
	metaPick(metafile) {
		return this.pick(
			Object.values(metafile.outputs).flatMap(
				({ imports }) => imports
					.filter(({ path: packageName, kind, external }) => external && kind === "import-statement" && !packageName.startsWith("node:"))
					.map(({ path: packageName }) => packageName.replace(trimExportsRegExp, "$1"))
			)
		);
	}
	
	#listWithoutSources = null;
	get #withoutSources() {
		return (this.#listWithoutSources ??= [ ...this.values() ].filter(pkg => !pkg.isSource));
	}
	
	asNames() {
		return this.#withoutSources.map(pkg => pkg.name).sort();
	}
	
	asPaths() {
		return this.#withoutSources.map(pkg => pkg.path);
	}
	
	asDependencies() {
		return this.#withoutSources.sort(sortPackages).reduce((dependencies, pkg) => {
			if (!dependencies[pkg.name] || compareVersions(pkg.version, dependencies[pkg.name]) === 1)
				dependencies[pkg.name] = pkg.version;
			
			return dependencies;
		}, {});
	}
	
	verifyExternal(metafile, cwd) {
		
		const illegallyBundled = [];
		const absoluteInputPaths = Object.keys(metafile.inputs).map(inputPath => path.resolve(cwd, inputPath));
		
		for (const externalPkg of this.values())
			if (absoluteInputPaths.some(inputPath => inputPath.startsWith(`${externalPkg.path}${path.sep}`)))
				illegallyBundled.push(externalPkg.name);
		
		if (illegallyBundled.length)
			throw new Error(
				"The following packages were declared as external but were bundled anyway:\n" +
				`${illegallyBundled.map(packageName => `• ${packageName}`).join("\n")}\n\n` +
				"This usually means esbuild could not resolve these packages and fell back to bundling,\n" +
				"which can lead to runtime errors like \"Dynamic require not supported\".\n" +
				"Check your configuration and ensure these packages are resolvable from your project root."
			);
	}
	
	clear() {
		
		super.clear();
		
		this.#local = null;
		this.#external = null;
		this.#sources = null;
		this.#listWithoutSources = null;
		
	}
	
	
	static unite(...packageMaps) {
		return new PackageMap(packageMaps.flatMap(packageMap => [ ...packageMap ]));
	}
	
}


export class Packages extends PackageMap {
	constructor({
		sources = [ process.cwd() ],
		local,
		external,
		...restOptions
	} = {}) {
		super();
		
		const parseOptions = {
			map: this,
			localMatcher: local && micromatch.matcher(local, { dot: true }),
			externalMatcher: external && micromatch.matcher(external, { dot: true }),
			unresolvedDependencies: new Map(),
			versionMismatches: [],
			...restOptions
		};
		
		for (const packagePath of sources)
			parse(packagePath, parseOptions, true);
		
		if (parseOptions.unresolvedDependencies.size)
			throw new Error(
				"Could not resolve the following dependencies:\n" +
				`${[ ...parseOptions.unresolvedDependencies ].map(([ dependencyName, requiredBy ]) => `• ${dependencyName} (required by ${requiredBy})`).join("\n")}\n\n` +
				"This means the packages are not declared in the correct package.json or could not be found in node_modules."
			);
		
		if (parseOptions.versionMismatches.length)
			console.warn(
				"Version Mismatch Warning:\n" +
				`${parseOptions.versionMismatches.map(({ consumer, dependency, declared, actual }) => `• ${consumer} wants ${dependency}@${declared}, but resolved to ${actual}`).join("\n")}\n\n` +
				"This is often caused by dependency hoisting in a monorepo and might cause subtle bugs.\n" +
				"Consider aligning the versions in your package.json files."
			);
		
	}
	
	
	static of(sources, options) {
		return new Packages({ sources, ...options });
	}
	
	static nameRegExp = nameRegExp;
	
	static metaFileNames(metafile, cwd) {
		const map = cwd ? fileName => path.resolve(cwd, fileName) : fileName => path.resolve(fileName);
		
		return Object.values(metafile.outputs).filter(output => output.entryPoint).flatMap(output => Object.keys(output.inputs).map(map));
	}
	
	static getClosestPackageDir(dirName) {
		if (!path.isAbsolute(dirName))
			dirName = path.resolve(dirName);
		
		if (statSync(dirName).isFile())
			dirName = path.dirname(dirName);
		
		while (!existsSync(path.join(dirName, "package.json"))) {
			const parentDirName = path.dirname(dirName);
			if (dirName === parentDirName) {
				dirName = null;
				break;
			} else
				dirName = parentDirName;
		}
		
		return dirName;
	}
	
	static resolvePath(target, baseDir = ".") {
		return resolvePackagePath(target, baseDir);
	}
	
	static async resolveAndRead(target, baseDir = ".") {
		return JSON.parse(await readFile(resolvePackagePath(target, baseDir), "utf8"));
	}
	
	static getParsedPackageJSON(packageJSONPath) {
		if (packageJSONCache.has(packageJSONPath))
			return packageJSONCache.get(packageJSONPath);
		
		const {
			name,
			version,
			dependencies,
			devDependencies,
			optionalDependencies,
			peerDependencies,
			scripts
		} = JSON.parse(readFileSync(packageJSONPath, "utf8"));
		
		const packageJSON = {
			name,
			version,
			dependencies,
			devDependencies,
			optionalDependencies,
			peerDependencies,
			...scripts && (scripts.prebuild || scripts.build || scripts.postbuild) && {
				scripts: {
					...scripts.prebuild && { prebuild: scripts.prebuild },
					...scripts.build && { build: scripts.build },
					...scripts.postbuild && { postbuild: scripts.postbuild }
				}
			}
		};
		
		packageJSONCache.set(packageJSONPath, packageJSON);
		
		return packageJSON;
	}
	
	static all = new PackageMap();
	
	static clearCache() {
		
		packageJSONCache.clear();
		
		this.all.clear();
		
	}
	
}
