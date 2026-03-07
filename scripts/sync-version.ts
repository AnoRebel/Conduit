/**
 * Syncs the version from the root `version.json` to all package manifests
 * and source files across the monorepo.
 *
 * Usage:
 *   bun run scripts/sync-version.ts          # sync from version.json
 *   bun run scripts/sync-version.ts 1.2.3    # set a specific version, updates version.json too
 *
 * Targets stamped:
 *   - ./package.json                          (root monorepo)
 *   - packages/{shared,client,server,admin,admin-ui}/package.json
 *   - packages/{shared,client,server,admin}/jsr.json
 *   - packages/shared/src/version.ts          (runtime VERSION constant)
 *   - packages/server/bin/conduit.js           (CLI --version)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const VERSION_FILE = join(ROOT, "version.json");

// ---------------------------------------------------------------------------
// 1. Determine the version
// ---------------------------------------------------------------------------

let version: string;

const cliArg = process.argv[2];

if (cliArg) {
	// Validate semver-ish format
	if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/.test(cliArg)) {
		console.error(`❌ Invalid version format: ${cliArg}`);
		console.error("   Expected: major.minor.patch[-prerelease]");
		process.exit(1);
	}
	version = cliArg;

	// Also update version.json itself
	writeFileSync(VERSION_FILE, `${JSON.stringify({ version }, null, "\t")}\n`);
	console.log(`📝 version.json → ${version}`);
} else {
	if (!existsSync(VERSION_FILE)) {
		console.error("❌ version.json not found and no version argument provided");
		process.exit(1);
	}
	const data = JSON.parse(readFileSync(VERSION_FILE, "utf8"));
	version = data.version;
}

console.log(`\n📦 Syncing version: ${version}\n`);

// ---------------------------------------------------------------------------
// 2. Helpers
// ---------------------------------------------------------------------------

function updateJsonFile(filePath: string, key: string): void {
	if (!existsSync(filePath)) {
		console.log(`   ⏭️  ${relative(filePath)} (not found, skipping)`);
		return;
	}
	const raw = readFileSync(filePath, "utf8");
	const data = JSON.parse(raw);
	if (data[key] === version) {
		console.log(`   ✅ ${relative(filePath)} (already ${version})`);
		return;
	}
	data[key] = version;

	// Detect indent: tabs or spaces
	const indent = raw.startsWith("{\n\t") ? "\t" : 2;
	writeFileSync(filePath, `${JSON.stringify(data, null, indent)}\n`);
	console.log(`   ✏️  ${relative(filePath)} → ${version}`);
}

function updateFileWithRegex(filePath: string, pattern: RegExp, replacement: string): void {
	if (!existsSync(filePath)) {
		console.log(`   ⏭️  ${relative(filePath)} (not found, skipping)`);
		return;
	}
	const content = readFileSync(filePath, "utf8");
	const updated = content.replace(pattern, replacement);
	if (content === updated) {
		console.log(`   ✅ ${relative(filePath)} (already up to date)`);
		return;
	}
	writeFileSync(filePath, updated);
	console.log(`   ✏️  ${relative(filePath)} → ${version}`);
}

function relative(filePath: string): string {
	return filePath.replace(`${ROOT}/`, "");
}

// ---------------------------------------------------------------------------
// 3. Stamp all targets
// ---------------------------------------------------------------------------

// Root package.json
console.log("Root:");
updateJsonFile(join(ROOT, "package.json"), "version");

// Package manifests
const jsrPackages = ["shared", "client", "server", "admin"];
const allPackages = [...jsrPackages, "admin-ui"];

console.log("\npackage.json files:");
for (const pkg of allPackages) {
	updateJsonFile(join(ROOT, "packages", pkg, "package.json"), "version");
}

console.log("\njsr.json files:");
for (const pkg of jsrPackages) {
	updateJsonFile(join(ROOT, "packages", pkg, "jsr.json"), "version");
}

// Runtime version constant
console.log("\nSource files:");
updateFileWithRegex(
	join(ROOT, "packages", "shared", "src", "version.ts"),
	/export const VERSION = ".*"/,
	`export const VERSION = "${version}"`
);

// CLI version
updateFileWithRegex(
	join(ROOT, "packages", "server", "bin", "conduit.js"),
	/\.version\(".*?"\)/,
	`.version("${version}")`
);

console.log("\n✅ Version sync complete\n");
