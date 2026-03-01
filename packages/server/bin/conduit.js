#!/usr/bin/env node

import { Command } from "commander";
import { createConduitServer } from "../dist/adapters/node.js";

const program = new Command();

program.name("conduit").description("Conduit Server - WebRTC signaling server").version("1.0.0");

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

		console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   Conduit Server v1.0.0                   ║
╚═══════════════════════════════════════════════════════════╝
`);

		const conduitServer = createConduitServer({
			config: {
				port,
				host,
				key,
				path,
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

		conduitServer.listen(port, host, () => {
			console.log(`Server listening on ${host}:${port}`);
			console.log(`Path: ${path}`);
			console.log(`Key: ${key}`);
			console.log(`Discovery: ${allowDiscovery ? "enabled" : "disabled"}`);
			console.log(`Relay: ${relayEnabled ? "enabled" : "disabled"}`);
			if (adminEnabled) {
				console.log(`Admin: enabled`);
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
