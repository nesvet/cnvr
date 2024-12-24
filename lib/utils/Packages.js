import childProcess from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import anymatch from "anymatch";
import { compareVersions } from "compare-versions";
import resolvePackagePath from "resolve-package-path";
import { debounce, getPath, setPath } from "@nesvet/n";


const nodeModulesRegExp = /\/node_modules\//;

const semVerRegExp = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*))*))?(?:\+([\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*))?$/;

const nameBaseRegExp = /(?:@[\da-z~-][\d._a-z~-]*\/)?[\da-z~-][\d._a-z~-]*/;

const nameRegExp = new RegExp(`^${nameBaseRegExp.source}$`);

const trimExportsRegExp = new RegExp(`^(${nameBaseRegExp.source})/.+$`);


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
	
	
	static bumpVersion = debounce(async pkg => {
		
		try {
			const packageJSONFileName = path.join(pkg.path, "package.json");
			const packageJSON = await readFile(packageJSONFileName, "utf8");
			
			const { version } = JSON.parse(packageJSON);
			
			if (pkg.version === version) {
				const [ , major, minor, patch ] = version.match(semVerRegExp);
				
				pkg.version = `${major}.${minor}.${Number.parseInt(patch) + 1}`;
				
				await writeFile(packageJSONFileName, packageJSON.replace(new RegExp(`(\\n\\s+"version"\\s*:\\s*")${version}(",?\\n)`), `$1${pkg.version}$2`), "utf8");
			} else
				pkg.version = version;
		} catch {}
		
	}, 1000, { leading: false, trailing: true });
	
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
		sourcePath
	} = options;
	
	const {
		name,
		dependencies,
		devDependencies,
		optionalDependencies,
		peerDependencies,
		...restPackageJSON
	} = JSON.parse(readFileSync(path.join(packagePath, "package.json"), "utf8"));
	
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
		
		if (isSource || isLocal)
			for (const dependencyName of Object.keys({
				...dependencies,
				...isDev && devDependencies,
				...isOptional && optionalDependencies,
				...isPeer && peerDependencies
			})) {
				const dependencyPackageJSONPath = resolvePackagePath(dependencyName, sourcePath);
				if (dependencyPackageJSONPath)
					parse(path.dirname(dependencyPackageJSONPath), options);
			}
	}
	
}

function sortPackages(a, b) {
	return a.name > b.name ? 1 : b.name > a.name ? -1 : 0;
}


export class PackageMap extends Map {
	
	#local;
	get local() {
		return (this.#local ??= new PackageMap([ ...this.entries() ].filter(([ , pkg ]) => pkg.isLocal)));
	}
	
	#external;
	get external() {
		return (this.#external ??= new PackageMap([ ...this.entries() ].filter(([ , pkg ]) => pkg.isExternal)));
	}
	
	#sources;
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
	
	#listWithoutSources;
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
			localMatcher: local && anymatch(local),
			externalMatcher: external && anymatch(external),
			...restOptions
		};
		
		for (const packagePath of sources)
			parse(packagePath, parseOptions, true);
		
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
	
}
