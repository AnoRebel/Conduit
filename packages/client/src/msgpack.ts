/**
 * @module @conduit/client/msgpack
 *
 * MsgPack serialization adapter for Conduit.
 *
 * Usage:
 * ```typescript
 * import { Conduit, SerializationType } from '@conduit/client';
 * import '@conduit/client/msgpack'; // Register MsgPack serializer
 *
 * const conduit = new Conduit({
 *   serialization: SerializationType.MsgPack
 * });
 * ```
 */

import { SerializationType } from "@conduit/shared";
import { decode, encode } from "@msgpack/msgpack";

/** @ignore Serializer registry entry shape used by the DataConnection serialization layer. */
interface Serializer {
	/** Encode arbitrary data to binary. */
	serialize: (data: unknown) => Uint8Array;
	/** Decode binary data back to a JavaScript value. */
	deserialize: (data: ArrayBuffer | Uint8Array) => unknown;
}

// Register MsgPack serializer
const serializer: Serializer = {
	serialize: (data: unknown): Uint8Array => {
		return encode(data);
	},
	deserialize: (data: ArrayBuffer | Uint8Array): unknown => {
		const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
		return decode(buffer);
	},
};

// Register globally for the DataConnection to pick up
// Uses globalThis cast to avoid `declare global` which JSR disallows
if (typeof globalThis !== "undefined") {
	const g = globalThis as Record<string, unknown>;
	if (!g.__CONDUIT_SERIALIZERS__) {
		g.__CONDUIT_SERIALIZERS__ = new Map<SerializationType, Serializer>();
	}
	(g.__CONDUIT_SERIALIZERS__ as Map<SerializationType, Serializer>).set(
		SerializationType.MsgPack,
		serializer
	);
}

export { encode, decode };
export default serializer;
