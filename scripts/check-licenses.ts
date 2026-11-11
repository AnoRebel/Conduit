/**
 * License gate for every package in bun.lock (direct and transitive, prod and dev).
 *
 * Fails when a package's license is not on the allowlist and has no reviewed
 * exception below. Run after `bun install`: `bun run licenses`.
 *
 * Adding a dependency that trips this? Either pick another package, or add an
 * EXCEPTIONS entry saying why the license is acceptable for how we use it.
 */
import { Glob } from "bun";

/** Permissive licenses compatible with distributing Conduit under MIT or Apache-2.0. */
const ALLOWED = new Set([
	"MIT",
	"MIT-0",
	"ISC",
	"BSD-2-Clause",
	"BSD-3-Clause",
	"0BSD",
	"Apache-2.0",
	"BlueOak-1.0.0",
	"CC0-1.0",
	"CC-BY-4.0",
	"Unlicense",
	"Python-2.0",
	"Zlib",
	"WTFPL",
]);

/**
 * Reviewed non-allowlisted licenses, keyed by package name. `license` is what the
 * check saw when reviewed: if it changes, the package fails again for re-review.
 */
const EXCEPTIONS: Record<string, { license: string; reason: string }> = {
	lightningcss: {
		license: "MPL-2.0",
		reason: "Build-time CSS tool (Tailwind/Vite), used unmodified, not shipped.",
	},
	bunwright: {
		license: "UNKNOWN",
		reason: "LGPL-2.1 (LICENSE.md). admin-ui e2e devDependency only, unmodified, not shipped.",
	},
	zigpty: { license: "UNKNOWN", reason: "MIT per LICENSE file. Dev-only (Nuxt DevTools)." },
	"vaul-vue": { license: "UNKNOWN", reason: "MIT per upstream repository LICENSE." },
};

/** lightningcss-<platform> binaries share lightningcss's review. */
function exceptionFor(name: string) {
	return (
		EXCEPTIONS[name] ?? EXCEPTIONS[name.replace(/-(android|darwin|freebsd|linux|win32)-.+$/, "")]
	);
}

type Lock = { packages: Record<string, [string, ...unknown[]]> };

const root = new URL("..", import.meta.url).pathname;
const lock = Bun.JSONC.parse(await Bun.file(`${root}bun.lock`).text()) as Lock;

/** Normalise package.json `license` / legacy `licenses` into an SPDX-ish string. */
function licenseOf(pkg: Record<string, unknown>): string {
	const l = pkg.license ?? pkg.licenses;
	if (typeof l === "string") return l;
	if (Array.isArray(l)) return l.map(x => (typeof x === "string" ? x : x?.type)).join(" OR ");
	if (l && typeof l === "object" && "type" in l) return String((l as { type: unknown }).type);
	return "UNKNOWN";
}

/** An SPDX expression passes if any OR-branch has every AND-term allowed. */
function allowed(expr: string): boolean {
	return expr
		.replace(/[()]/g, "")
		.split(/\s+OR\s+/i)
		.some(branch => branch.split(/\s+AND\s+/i).every(id => ALLOWED.has(id.trim())));
}

/** Installed manifest first; registry for packages not installed on this platform. */
async function resolveLicense(name: string, version: string): Promise<string> {
	const dir = `${name.replace("/", "+")}@${version}`;
	const glob = new Glob(`{${dir},${dir}+*}/node_modules/${name}/package.json`);
	for await (const file of glob.scan({ cwd: `${root}node_modules/.bun` })) {
		return licenseOf(await Bun.file(`${root}node_modules/.bun/${file}`).json());
	}
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(`https://registry.npmjs.org/${name}/${version}`);
			if (res.ok) return licenseOf(await res.json());
		} catch {}
	}
	return "UNRESOLVED";
}

const specs = new Set<string>();
for (const [spec] of Object.values(lock.packages)) {
	if (!spec.includes("@workspace:")) specs.add(spec);
}
const seen = new Map<string, string>();
await Promise.all(
	[...specs].map(async spec => {
		const at = spec.lastIndexOf("@");
		seen.set(spec, await resolveLicense(spec.slice(0, at), spec.slice(at + 1)));
	})
);

const counts = new Map<string, number>();
const failures: string[] = [];
for (const [id, license] of seen) {
	counts.set(license, (counts.get(license) ?? 0) + 1);
	const name = id.slice(0, id.lastIndexOf("@"));
	if (!allowed(license) && exceptionFor(name)?.license !== license) {
		failures.push(`${id}: ${license}`);
	}
}

console.log(`Checked ${seen.size} packages from bun.lock`);
for (const [license, n] of [...counts].sort((a, b) => b[1] - a[1]))
	console.log(`  ${n}\t${license}`);

if (failures.length) {
	console.error(`\n${failures.length} package(s) need review:`);
	for (const f of failures.sort()) console.error(`  ${f}`);
	process.exit(1);
}
console.log("\nAll licenses allowed.");
