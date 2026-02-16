# cnvr

**Build and dev in one config file.**

Chain stages, run once to build, or watch and rebuild.

```bash
node .conveyer.js
```

## Installation

```bash
npm install cnvr --save-dev
```

For `.conveyer.ts` you need `tsx` as a peer dependency:

```bash
npm install tsx --save-dev
```

## Quick Start

Create `.conveyer.js` in your project root:

```javascript
import { resolve } from "node:path";
import { Conveyer, ESBuild } from "cnvr";

new Conveyer([
	new ESBuild({
		entryPoints: [ "src/index.ts" ],
		outfile: resolve("dist", "index.js"),
		external: true,
		platform: "neutral",
		format: "esm",
		sourcemap: true,
		target: "es2020"
	})
], { initialCleanup: "dist" });
```

Add to `package.json`:

```json
{
	"scripts": {
		"build": "node .conveyer.js",
		"dev": "node .conveyer.js --dev"
	}
}
```

Run `npm run build` for a one-shot build, or `npm run dev` for watch mode.

## Entry Points

cnvr looks for a conveyer file in the current directory or the path you pass:

| Pattern | Example |
|---------|---------|
| `.conveyer.js` | Root file |
| `.conveyer.ts` | TypeScript (requires tsx) |
| `.conveyer.mjs` / `.conveyer.cjs` | ESM / CJS |
| `.conveyer/index.{js,ts,mjs,cjs}` | Alternative layout |

**CLI:**

- `cnvr` — runs `.conveyer.js` (or path you pass)
- `cnvr-ts` — runs `.conveyer.ts` via tsx

**Direct run:**

```bash
node .conveyer.js
npx cnvr
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `development` or `production` |
| `WATCH` | Enable watch mode |
| `BUILD` | Production build mode |
| `DEV` | Dev mode (watch + dev options) |
| `BUNDLE` | Create zip bundle |
| `FORCE` | Rebuild all, including dependencies |
| `VERSION` | From package.json |
| `GIT_COMMIT_ID` | Current git commit |
| `SOURCEMAPS` | Enable sourcemaps in production |

**CLI flags:** `-p` / `--production`, `-d` / `--development`, `-e` / `--env <name>`, `-f` / `--force`.

## Public API

### Conveyer

```javascript
new Conveyer(stages, options?)
```

- `stages` — Array of stages (supports nesting up to 3 levels)
- `options.initialCleanup` — Path(s) to clean before first run
- `options.context` — Extra data in shared context

### Stage (base class)

All stages extend `Stage`. Base options:

```javascript
new Stage({ watch, initialCleanup, cwd, symbol, title, id, ... })
```

| Option | Type | Description |
|--------|------|-------------|
| `watch` | `string` \| `string[]` \| `{ paths, events, ... }` | Paths to watch (chokidar) |
| `initialCleanup` | `string` \| `string[]` | Dir(s) to clean before `run` |
| `cwd` | `string` | Working directory (default: `process.cwd()`) |
| `symbol` | `string` | Log icon |
| `title` | `string` | Stage name in logs |
| `id` | `string` | Unique ID (default: derived from title) |

**Hooks:** `onInit`, `onBefore`, `onAfter` — all optional, async.

**Override:** `do(isInitial, ...args)` — main logic.

### ESBuild

Bundles with esbuild. Supports JSX, jscc, raw imports.

```javascript
new ESBuild({
	entryPoints: [ "src/index.ts" ],
	outfile: resolve("dist", "index.js"),
	external: true,           // or array of package names, or [ true ] for auto
	local: [ "my-pkg" ],     // local packages to bundle
	alias: { "@": "src" },
	define: { "process.env.NODE_ENV": JSON.stringify(NODE_ENV) },
	jsx: "automatic",
	jsccValues: { _DEV: true },
	plugins: [ myPlugin ],
	platform: "neutral",
	format: "esm",
	target: "es2020",
	loader: { ".svg": "file" },
	mainFields: [ "module", "main" ],
	watch: { paths: [ "public" ], events: [ "change" ] }
})
```

After build: `context.packages`, `context.dependencies` (from metafile).

### Copier

Copies files or directories. Watches and syncs on change.

```javascript
new Copier({
	targets: [
		[ "public", "dist/public" ],
		[ "assets", "dist/assets" ]
	]
})
```

- `targets` — `[[src, dest], ...]` or `[src, dest]` for a single pair
- Other stages can push to `context.targets` (Map) before Copier runs
- Watch: add/change → copy, addDir → mkdir, unlink/unlinkDir → rm

### Bundler

Creates a zip archive from targets.

```javascript
new Bundler({
	target: "dist",
	targets: [ [ "dist", ".", false, false ] ],
	destDir: "release",
	name: "my-app-1.0.0",
	getName: (ctx) => `${ctx.packageJSON.name}-${ctx.packageJSON.version}`,
	compressionLevel: "high",
	onDone: (path) => console.log("Bundle:", path)
})
```

- `target` / `targets` — `src` or `[src, relativeDest?, shouldCompress?, shouldRemove?]`
- Uses `context.targets` (array) from other stages
- `compressionLevel`: `"high"` \| `"medium"` \| `"low"`

### NodeProcess

Runs Node.js with dev-friendly flags.

```javascript
new NodeProcess({
	entry: "dist/index.js",
	inspect: true,
	enableSourceMaps: true,
	traceWarnings: true,
	traceUncaught: true,
	args: [ "--experimental-vm-modules" ],
	watch: { paths: [ "dist" ] }
})
```

### BunProcess

Runs Bun.

```javascript
new BunProcess({
	entry: "src/index.ts",
	inspect: false,
	hot: true,
	smol: false,
	args: [],
	watch: { paths: [ "src" ] }
})
```

### ChildProcess (base)

Base for custom process stages.

```javascript
new ChildProcess({
	command: "my-cli",
	args: [ "--flag" ],
	cwd: process.cwd(),
	env: { CUSTOM: "1" },
	watchdog: true,
	checkIfRunning: false,
	filterStdout: [ "noise" ],
	filterStderr: [ "deprecated" ],
	stopTimeout: 3000,
	killTimeout: 1000,
	isDetached: false
})
```

### MongodProcess

Starts MongoDB. Skips if already running.

```javascript
new MongodProcess({
	config: "/usr/local/etc/mongod.conf",
	args: [],
	watch: { paths: [ "config" ] }
})
```

### NginxProcess

Starts nginx. Uses `nginx -s stop` on exit.

```javascript
new NginxProcess({
	config: "nginx.conf",
	args: [],
	watch: { paths: [ "nginx.conf" ] }
})
```

### PackageJSONMaker

Generates a minimal `package.json` with selected dependencies.

```javascript
new PackageJSONMaker({
	src: ".",
	dest: "dist",
	dependenciesOf: [ "esbuild" ],
	dependencies: [ "chalk", "ora" ],
	symlinkNodeModules: true,
	overrides: { "engines": { "node": ">=18" } }
})
```

- `dependenciesOf` — Stage IDs to pull dependencies from (e.g. `["esbuild"]`)
- `dependencies` — Array of names or `() => string[]`
- `symlinkNodeModules` — Symlink instead of copy (for dev)

### Reveal

Opens a path in the system file manager (Finder, Explorer, nautilus, etc.).

```javascript
new Reveal({
	target: "dist",
	noTargetPhrase: "Nothing to show"
})
```

Uses `target` or `context.target` if set.

## Utils

Exported helpers:

| Export | Description |
|--------|-------------|
| `env(dirName?, envName?)` | Load `.env` with `${VAR}` interpolation, `.env.local`, `.env.{NODE_ENV}` |
| `log(message, type?, title?, bold?)` | Console output; `log.progress()`, `log.finish()` |
| `Packages` | Package.json, workspace, external/local resolution |
| `getCurrentCommitId(short?)` | Current git commit |
| `reveal(path)` | Open path in file manager |
| `rawImportPlugin()` | esbuild plugin for `?raw` imports |
| `copyRecursive`, `pathExists`, `isRunning` | File utilities |

## Workspace & Multi-Entrypoint

For monorepos, use `Entrypoints` to orchestrate multiple conveyer files. Dependencies are inferred from `scripts.build` in package.json.

```javascript
import { __Entrypoints as Entrypoints } from "cnvr";

new Entrypoints({ entrypointsWatchQueueDelay: 300 }, true);
```

## Custom Stage

```javascript
import { Stage } from "cnvr";

class MyStage extends Stage {
	constructor(options) {
		super({
			symbol: "🔧",
			title: "My Stage",
			watch: "src/**",
			...options
		});
	}

	async do(isInitial, eventMap) {
		// Your logic
	}
}
```

## Transparency

- Runs locally — no external services, no data leaves your machine
- Peer: `tsx` for TypeScript conveyer files
- cnvr is maintained by one developer
