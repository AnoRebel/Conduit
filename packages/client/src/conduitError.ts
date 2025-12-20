import type { ConduitErrorType } from "@conduit/shared";

export class ConduitError extends Error {
	constructor(
		public readonly type: ConduitErrorType,
		message: string
	) {
		super(message);
		this.name = "ConduitError";
	}
}
