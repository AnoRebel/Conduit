#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { Command } from "commander";
import { createConduitServer } from "../dist/adapters/node.js";

const program = new Command();

program.name("conduit").description("Conduit Server - WebRTC signaling server").version("1.0.1");

program
	.command("start")
	.alias("serve")
	.description("Start the Conduit server")
	.option("-p, --port <port>", "Port to listen on", "9000")
	.option("-H, --host <host>", "Host to bind to", "0.0.0.0")
	.option("-k, --key <key>", "API key for clients", "conduit")
	.option("--path <path>", "Path prefix", "/")
	.option("--allow-discovery", "Allow peer discovery API", false)
	.option("--concurrent-limit <limit>", "Max concurrent connections", "5000")
	.option("--alive-timeout <ms>", "Connection alive timeout in ms", "60000")
	.option("--expire-timeout <ms>", "Message expire timeout in ms", "5000")
	.option("--cors <origin>", "CORS origin (use * for all)", "*")
	.option("--no-relay", "Disable WebSocket relay transport")
	.option("--admin", "Enable admin API")
	.option("--admin-path <path>", "Admin API path prefix", "/admin")
	.option("--admin-auth-type <type>", "Admin auth type (apiKey, jwt, basic)", "apiKey")
	.option("--admin-api-key <key>", "Admin API key")
	.option("--auth <mode>", "Auth mode for signaling: key or none", "key")
	.option("--db <path>", "SQLite database path for admin persistence")
	.option("--admin-ui <dir>", "Serve admin UI static files from this directory")
	.option("--admin-ui-path <path>", "URL path to serve admin UI at", "/ui")
	.action(async options => {
		const port = parseInt(options.port, 10);
		const host = options.host;
		const key = options.key;
		const path = options.path;
		const allowDiscovery = options.allowDiscovery;
		const concurrentLimit = parseInt(options.concurrentLimit, 10);
		const aliveTimeout = parseInt(options.aliveTimeout, 10);
		const expireTimeout = parseInt(options.expireTimeout, 10);
		const corsOrigin = options.cors === "*" ? true : options.cors;
		const relayEnabled = options.relay !== false;
		const authMode = env("AUTH_MODE") || options.auth || "key";
		const dbPath = env("ADMIN_DB_PATH") || options.db;

		// Resolve admin settings: env vars take precedence over CLI flags
		const adminEnabled =
			env("ADMIN_ENABLED") === "true" || env("ADMIN_ENABLED") === "1" || options.admin === true;
		const adminPath = env("ADMIN_PATH") || options.adminPath;
		const adminAuthType = env("ADMIN_AUTH_TYPE") || options.adminAuthType;
		const adminApiKey = env("ADMIN_API_KEY") || options.adminApiKey;
		const adminJwtSecret = env("ADMIN_JWT_SECRET");
		const adminBasicUser = env("ADMIN_BASIC_USER");
		const adminBasicPass = env("ADMIN_BASIC_PASS");
		const adminCorsOrigins = env("ADMIN_CORS_ORIGINS") || options.cors;
		const adminUiDir = env("ADMIN_UI_DIR") || options.adminUi;
		const adminUiPath = env("ADMIN_UI_PATH") || options.adminUiPath || "/ui";

		console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   Conduit Server v1.0.1
╚═══════════════════════════════════════════════════════════╝
`);

		const conduitServer = createConduitServer({
			config: {
				port,
				host,
				key,
				path,
				auth: {
					mode: authMode,
				},
				allowDiscovery,
				concurrentLimit,
				aliveTimeout,
				expireTimeout,
				corsOrigin,
				relay: {
					enabled: relayEnabled,
					maxMessageSize: 65536,
				},
			},
			onClientConnect: client => {
				console.log(`[${new Date().toISOString()}] Client connected: ${client.id}`);
			},
			onClientDisconnect: clientId => {
				console.log(`[${new Date().toISOString()}] Client disconnected: ${clientId}`);
			},
		});

		// Set up admin API if enabled
		if (adminEnabled) {
			try {
				const { createAdminConfig, createAdminCore, createNodeAdminServer, createAdminWSServer } =
					await import("@conduit/admin");

				// Build auth config from env/CLI options
				const authMethods = [adminAuthType].filter(Boolean);
				const authConfig = {
					methods: authMethods,
					apiKey: adminApiKey,
					jwtSecret: adminJwtSecret,
					basicCredentials:
						adminBasicUser && adminBasicPass
							? { username: adminBasicUser, password: adminBasicPass }
							: undefined,
				};

				const adminConfig = createAdminConfig({
					path: adminPath,
					auth: authConfig,
					...(dbPath ? { persistence: { type: "sqlite", dbPath } } : {}),
				});

				const adminCore = createAdminCore({ config: adminConfig });
				adminCore.attachToServer(conduitServer.core);

				const adminServer = createNodeAdminServer({
					admin: adminCore,
					corsOrigins: adminCorsOrigins === "*" ? "*" : adminCorsOrigins,
				});
				const adminWS = createAdminWSServer({ admin: adminCore });

				const adminBasePath = adminServer.basePath;
				const adminWSPath = `${adminBasePath}/ws`;

				// Import ws for admin WebSocket upgrade handling
				const { WebSocketServer } = await import("ws");
				const adminWSS = new WebSocketServer({ noServer: true });

				// Intercept HTTP requests: prepend admin handler before the conduit handler
				// Remove existing request listeners, add admin-aware handler, then re-add originals
				const existingRequestListeners = conduitServer.server.listeners("request").slice();
				conduitServer.server.removeAllListeners("request");

				conduitServer.server.on("request", (req, res) => {
					const url = req.url || "";
					const pathname = url.split("?")[0] || "";

					if (pathname.startsWith(adminBasePath)) {
						adminServer.handleRequest(req, res);
						return;
					}

					// Fall through to original conduit handler(s)
					for (const listener of existingRequestListeners) {
						listener.call(conduitServer.server, req, res);
					}
				});

				// Intercept WebSocket upgrade: prepend admin WS handler
				const existingUpgradeListeners = conduitServer.server.listeners("upgrade").slice();
				conduitServer.server.removeAllListeners("upgrade");

				conduitServer.server.on("upgrade", (request, socket, head) => {
					const url = request.url || "";
					const pathname = url.split("?")[0] || "";

					if (pathname === adminWSPath || pathname === `${adminWSPath}/`) {
						adminWSS.handleUpgrade(request, socket, head, ws => {
							adminWS.handleConnection(ws, request);
						});
						return;
					}

					// Fall through to original conduit upgrade handler(s)
					for (const listener of existingUpgradeListeners) {
						listener.call(conduitServer.server, request, socket, head);
					}
				});

				console.log(`Admin API enabled at ${adminBasePath}`);
				console.log(`Admin WS at ${adminWSPath}`);
				console.log(`Admin auth: ${adminAuthType}`);

				// Extend shutdown to clean up admin resources
				const originalClose = conduitServer.close.bind(conduitServer);
				conduitServer.close = callback => {
					adminWS.close();
					adminCore.destroy();
					originalClose(callback);
				};
			} catch (err) {
				console.error("Failed to initialize admin API:", err);
				console.error("Make sure @conduit/admin is installed. Continuing without admin API...");
			}
		}

		// Set up embedded admin UI static file serving
		if (adminUiDir) {
			const resolvedDir = resolve(adminUiDir);
			if (!existsSync(resolvedDir)) {
				console.error(`Admin UI directory not found: ${resolvedDir}`);
				console.error("Continuing without embedded admin UI...");
			} else {
				// Normalize path: ensure leading slash, no trailing slash
				const uiPrefix = adminUiPath.startsWith("/") ? adminUiPath : `/${adminUiPath}`;
				const normalizedPrefix = uiPrefix.endsWith("/") ? uiPrefix.slice(0, -1) : uiPrefix;

				// Prepend a static file handler before existing request listeners
				const existingListeners = conduitServer.server.listeners("request").slice();
				conduitServer.server.removeAllListeners("request");

				conduitServer.server.on("request", (req, res) => {
					const url = req.url || "";
					const pathname = url.split("?")[0] || "";

					if (pathname === normalizedPrefix || pathname.startsWith(`${normalizedPrefix}/`)) {
						serveStaticFile(resolvedDir, normalizedPrefix, pathname, res);
						return;
					}

					// Fall through to existing handlers (admin API, conduit)
					for (const listener of existingListeners) {
						listener.call(conduitServer.server, req, res);
					}
				});

				console.log(`Admin UI serving from ${resolvedDir} at ${normalizedPrefix}`);
			}
		}

		conduitServer.listen(port, host, () => {
			console.log(`Server listening on ${host}:${port}`);
			console.log(`Path: ${path}`);
			console.log(`Key: ${key}`);
			console.log(`Auth: ${authMode}`);
			console.log(`Discovery: ${allowDiscovery ? "enabled" : "disabled"}`);
			console.log(`Relay: ${relayEnabled ? "enabled" : "disabled"}`);
			if (adminEnabled) {
				console.log(`Admin: enabled`);
				if (dbPath) {
					console.log(`Database: ${dbPath}`);
				}
			}
			if (adminUiDir) {
				console.log(`Admin UI: ${adminUiPath}`);
			}
			console.log("");
			console.log("Press Ctrl+C to stop the server");
		});

		// Graceful shutdown
		process.on("SIGINT", () => {
			console.log("\nShutting down server...");
			conduitServer.close(() => {
				console.log("Server stopped");
				process.exit(0);
			});
		});

		process.on("SIGTERM", () => {
			console.log("\nShutting down server...");
			conduitServer.close(() => {
				console.log("Server stopped");
				process.exit(0);
			});
		});
	});

program
	.command("init")
	.description("Initialize a new Conduit server configuration interactively")
	.action(async () => {
		const { confirm, input, number } = await import("@inquirer/prompts");

		console.log("Conduit Server Configuration\n");

		const port = await number({
			message: "Port to listen on:",
			default: 9000,
		});

		const host = await input({
			message: "Host to bind to:",
			default: "0.0.0.0",
		});

		const key = await input({
			message: "API key for clients:",
			default: "conduit",
		});

		const path = await input({
			message: "Path prefix:",
			default: "/",
		});

		const allowDiscovery = await confirm({
			message: "Allow peer discovery API?",
			default: false,
		});

		const enableRelay = await confirm({
			message: "Enable WebSocket relay transport?",
			default: true,
		});

		console.log("\nConfiguration:");
		console.log(
			JSON.stringify(
				{
					port,
					host,
					key,
					path,
					allowDiscovery,
					relay: { enabled: enableRelay },
				},
				null,
				2
			)
		);

		const start = await confirm({
			message: "Start the server with this configuration?",
			default: true,
		});

		if (start) {
			const server = createConduitServer({
				config: {
					port: port ?? 9000,
					host,
					key,
					path,
					allowDiscovery,
					relay: {
						enabled: enableRelay,
						maxMessageSize: 65536,
					},
				},
				onClientConnect: client => {
					console.log(`[${new Date().toISOString()}] Client connected: ${client.id}`);
				},
				onClientDisconnect: clientId => {
					console.log(`[${new Date().toISOString()}] Client disconnected: ${clientId}`);
				},
			});

			server.listen(port ?? 9000, host, () => {
				console.log(`\nServer started on ${host}:${port}`);
			});

			process.on("SIGINT", () => {
				console.log("\nShutting down...");
				server.close(() => process.exit(0));
			});
		}
	});

program.parse();

/** Read an environment variable, returning undefined if not set or empty */
function env(name) {
	const value = process.env[name];
	return value && value.trim() !== "" ? value.trim() : undefined;
}

/** MIME type map for static file serving */
const MIME_TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".mjs": "application/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".otf": "font/otf",
	".map": "application/json",
};

/**
 * Serve a static file from the given root directory.
 * Supports SPA fallback — serves index.html for paths that don't match a file.
 */
function serveStaticFile(rootDir, prefix, pathname, res) {
	// Strip the prefix to get the relative file path
	let relativePath = pathname.slice(prefix.length);
	if (!relativePath || relativePath === "/") {
		relativePath = "/index.html";
	}

	// Security: prevent directory traversal
	const normalizedPath = join(rootDir, relativePath);
	if (!normalizedPath.startsWith(rootDir)) {
		res.writeHead(403, { "Content-Type": "text/plain" });
		res.end("Forbidden");
		return;
	}

	try {
		// Try the exact file first
		if (existsSync(normalizedPath) && statSync(normalizedPath).isFile()) {
			const ext = extname(normalizedPath);
			const contentType = MIME_TYPES[ext] || "application/octet-stream";
			const content = readFileSync(normalizedPath);
			res.writeHead(200, {
				"Content-Type": contentType,
				"Content-Length": content.length,
				"Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
			});
			res.end(content);
			return;
		}

		// SPA fallback: serve index.html for client-side routing
		const indexPath = join(rootDir, "index.html");
		if (existsSync(indexPath)) {
			const content = readFileSync(indexPath);
			res.writeHead(200, {
				"Content-Type": "text/html; charset=utf-8",
				"Content-Length": content.length,
				"Cache-Control": "no-cache",
			});
			res.end(content);
			return;
		}

		res.writeHead(404, { "Content-Type": "text/plain" });
		res.end("Not Found");
	} catch {
		res.writeHead(500, { "Content-Type": "text/plain" });
		res.end("Internal Server Error");
	}
}
