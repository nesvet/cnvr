import fs from "node:fs";
import path from "node:path";
import anymatch from "anymatch";
import { compareVersions } from "compare-versions";
import { packageDirectorySync } from "pkg-dir";
import resolvePackagePath from "resolve-package-path";


const packageNamePattern = "(?:\\/@[\\w-\\.]+)?\\/[\\w-\\.]+";
const nodeModulesRegExp = /\/node_modules/;
const localPackageRegExp = /^(file|link):/;

function nameSort(a, b) {
	return a.name > b.name ? 1 : b.name > a.name ? -1 : 0;
}

function getDependenciesFrom(packagePath, dev, optional, peer) {
	
	const {
		dependencies,
		devDependencies,
		optionalDependencies,
		peerDependencies
	} = JSON.parse(fs.readFileSync(path.join(packagePath, "package.json"), "utf8"));
	
	return {
		...dependencies,
		...dev && devDependencies,
		...optional && optionalDependencies,
		...peer && peerDependencies
	};
}

function getMetafileMain(metafile) {
	return Object.entries(metafile.outputs).find(([ fileName ]) => !/\.map$/.test(fileName))[1];
}


export class Packages extends Map {
	constructor(optionsOrList = {}) {
		if (Array.isArray(optionsOrList))
			super(optionsOrList.map(pkg => [ pkg.path, pkg ]));
		else {
			const {
				metafile,
				sources = [ process.cwd() ],
				dev,
				optional,
				peer,
				localModulePaths,
				localModules,
				externalModules,
				fileNames
			} = optionsOrList;
			
			const packageMap = [];
			
			const localModulesRegExp = localModules ? new RegExp(`(^|/)(${localModules.join("|")})$`) : null;
			
			if (metafile) {
				const localModuleRegExp = localModulePaths ? new RegExp(`^${`${localModulePaths.length > 1 ? `(?:${localModulePaths.join("|")})` : localModulePaths[0]}`}${packageNamePattern}$`) : null;
				const basePartRegExp = new RegExp(`^${localModulePaths ? `(?:${localModulePaths.join("|")}|` : ""}.*?${nodeModulesRegExp.source}${localModulePaths ? ")" : ""}${packageNamePattern}${nodeModulesRegExp.source}`);
				
				const packagePaths = new Set((fileNames || Packages.makeFileNames(metafile)).map(packageDirectorySync));
				
				for (const packagePath of packagePaths)
					if (!sources.includes(packagePath)) {
						const isLocal = localModulesRegExp?.test(packagePath) || localModuleRegExp?.test(packagePath);
						if (isLocal || !nodeModulesRegExp.test(packagePath.replace(basePartRegExp, "")))
							try {
								const { name, version } = JSON.parse(fs.readFileSync(path.join(packagePath, "package.json"), "utf8"));
								
								packageMap.push([ packagePath, {
									name,
									version,
									path: packagePath,
									isLocal: isLocal && !externalModules?.includes(name)
								} ]);
							} catch (error) {
								console.error(error);
							}
					}
				
				for (const { path: name, external } of getMetafileMain(metafile).imports)
					for (const source of sources) {
						const resolvedPackagePath = resolvePackagePath(name, source);
						
						if (resolvedPackagePath) {
							const packagePath = path.dirname(resolvedPackagePath);
							
							packageMap.push([ packagePath, {
								name,
								version: JSON.parse(fs.readFileSync(resolvedPackagePath, "utf8")).version,
								path: packagePath,
								isLocal: localModulesRegExp?.test(name) || !external
							} ]);
						}
					}
				
			} else {
				const targets = new Set(sources);
				const names = [];
				
				for (const target of targets)
					for (const [ name, value ] of Object.entries(getDependenciesFrom(target, dev, optional, peer)))
						if (!names.includes(name))
							for (const source of sources) {
								const resolvedPackagePath = resolvePackagePath(name, source);
								
								if (resolvedPackagePath) {
									names.push(name);
									
									const isLocal = localModulesRegExp?.test(name) || localPackageRegExp.test(value);
									const packagePath = path.dirname(resolvedPackagePath);
									
									packageMap.push([ packagePath, {
										name,
										version: JSON.parse(fs.readFileSync(resolvedPackagePath, "utf8")).version,
										path: packagePath,
										isLocal
									} ]);
									
									if (isLocal)
										targets.add(packagePath);
									
									break;
								}
							}
			}
			
			super(packageMap);
		}
		
	}
	
	asNames() {
		return [ ...new Set([ ...this.values() ].map(pkg => pkg.name)) ].sort();
	}
	
	asPaths() {
		return [ ...this.values() ].map(pkg => pkg.path).sort();
	}
	
	asDependencies() {
		return [ ...this.values() ].sort(nameSort).reduce((dependencies, pkg) => {
			if (!dependencies[pkg.name] || compareVersions(pkg.version, dependencies[pkg.name]) === 1)
				dependencies[pkg.name] = pkg.version;
			
			return dependencies;
		}, {});
	}
	
	local() {
		return new Packages([ ...this.values() ].filter(pkg => pkg.isLocal));
	}
	
	external() {
		return new Packages([ ...this.values() ].filter(pkg => !pkg.isLocal));
	}
	
	without(...matchers) {
		matchers = matchers.flat();
		
		return new Packages([ ...this.values() ].filter(pkg => !anymatch(matchers, pkg.name)));
	}
	
	only(...matchers) {
		matchers = matchers.flat();
		
		return new Packages([ ...this.values() ].filter(pkg => anymatch(matchers, pkg.name)));
	}
	
	
	static makeFileNames(metafile) {
		return Object.keys(getMetafileMain(metafile).inputs).map(fileName => path.resolve(fileName));
	}
	
}
