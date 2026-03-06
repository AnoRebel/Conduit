import type { ConduitErrorType } from "@conduit/shared";

/**
 * Custom error class for Conduit-specific errors.
 * Extends the standard `Error` with a typed `type` field
 * from {@link ConduitErrorType}.
 */
export class ConduitError extends Error {
	constructor(
		/** The specific Conduit error type. */
		public readonly type: ConduitErrorType,
		message: string
	) {
		super(message);
		this.name = "ConduitError";
	}
}
