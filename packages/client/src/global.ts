/**
 * Global export for UMD/browser usage
 * This file exposes Conduit on the window object
 */

import { AutoConnection } from "./dataconnection/AutoConnection.js";
import { DataConnection } from "./dataconnection/DataConnection.js";
import { WebSocketConnection } from "./dataconnection/WebSocketConnection.js";
import { MediaConnection } from "./mediaconnection.js";
import { Conduit } from "./conduit.js";
import { ConduitError } from "./conduitError.js";
import { util } from "./util.js";

// Re-export all types
export * from "./index.js";

// Attach to window for browser usage
if (typeof window !== "undefined") {
	const conduit = {
		Conduit,
		util,
		ConduitError,
		DataConnection,
		MediaConnection,
		WebSocketConnection,
		AutoConnection,
	};

	(window as unknown as { conduit: typeof conduit }).conduit = conduit;
	(window as unknown as { Conduit: typeof Conduit }).Conduit = Conduit;
}
