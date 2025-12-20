import { ConduitErrorType } from "@conduit/shared";
import type { ConduitOptions } from "./conduit.js";
import { ConduitError } from "./conduitError.js";
import { logger } from "./logger.js";

export class API {
	private readonly _options: ConduitOptions;

	constructor(options: ConduitOptions) {
		this._options = options;
	}

	private _buildUrl(path: string): string {
		const protocol = this._options.secure ? "https" : "http";
		const { host, port, path: basePath, key } = this._options;

		let url = `${protocol}://${host}`;

		if (port && port !== 443 && port !== 80) {
			url += `:${port}`;
		}

		url += basePath || "/";
		if (!url.endsWith("/")) {
			url += "/";
		}

		url += key || "conduit";
		url += path;

		return url;
	}

	async retrieveId(): Promise<string> {
		const url = this._buildUrl("/id");

		try {
			const response = await fetch(url, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const id = await response.text();
			return id;
		} catch (error) {
			logger.error("Error retrieving ID:", error);
			throw new ConduitError(
				ConduitErrorType.ServerError,
				`Could not get an ID from the server: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async listAllConduits(): Promise<string[]> {
		const url = this._buildUrl("/conduits");

		try {
			const response = await fetch(url, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
				},
			});

			if (!response.ok) {
				if (response.status === 401) {
					throw new ConduitError(
						ConduitErrorType.ServerError,
						"Conduit discovery is not enabled on this server"
					);
				}
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const conduits = (await response.json()) as string[];
			return conduits;
		} catch (error) {
			if (error instanceof ConduitError) {
				throw error;
			}
			logger.error("Error listing conduits:", error);
			throw new ConduitError(
				ConduitErrorType.ServerError,
				`Could not get conduits from the server: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}
}
