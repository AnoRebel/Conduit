/**
 * MsgPack serialization adapter for Conduit
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

// Type for the serializer registry (internal to Conduit)
interface Serializer {
	serialize: (data: unknown) => Uint8Array;
	deserialize: (data: ArrayBuffer | Uint8Array) => unknown;
}

declare global {
	interface Window {
		__CONDUIT_SERIALIZERS__?: Map<SerializationType, Serializer>;
	}
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
if (typeof window !== "undefined") {
	if (!window.__CONDUIT_SERIALIZERS__) {
		window.__CONDUIT_SERIALIZERS__ = new Map();
	}
	window.__CONDUIT_SERIALIZERS__.set(SerializationType.MsgPack, serializer);
}

export { encode, decode };
export default serializer;
