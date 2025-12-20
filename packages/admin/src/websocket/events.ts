import type { MetricsSnapshot } from "../types.js";

/**
 * Events that can be sent from server to client
 */
export interface ServerToClientEvents {
	"client:connected": {
		id: string;
		timestamp: number;
	};
	"client:disconnected": {
		id: string;
		reason: string;
		timestamp: number;
	};
	"metrics:update": MetricsSnapshot;
	"error:occurred": {
		type: string;
		message: string;
		timestamp: number;
	};
	"ban:added": {
		id: string;
		type: "client" | "ip";
		reason?: string;
		timestamp: number;
	};
	"ban:removed": {
		id: string;
		type: "client" | "ip";
		timestamp: number;
	};
	"audit:entry": {
		id: string;
		action: string;
		userId: string;
		timestamp: number;
		details?: Record<string, unknown>;
	};
}

/**
 * Events that can be sent from client to server
 */
export interface ClientToServerEvents {
	subscribe: {
		events: (keyof ServerToClientEvents)[];
	};
	unsubscribe: {
		events: (keyof ServerToClientEvents)[];
	};
	ping: Record<string, never>;
}

/**
 * All event types
 */
export type AdminEventType = keyof ServerToClientEvents;

/**
 * Typed event message
 */
export interface AdminEventMessage<T extends AdminEventType = AdminEventType> {
	type: T;
	data: ServerToClientEvents[T];
}

/**
 * Create an event message
 */
export function createEvent<T extends AdminEventType>(
	type: T,
	data: ServerToClientEvents[T],
): AdminEventMessage<T> {
	return { type, data };
}

/**
 * Serialize an event to JSON string
 */
export function serializeEvent<T extends AdminEventType>(
	type: T,
	data: ServerToClientEvents[T],
): string {
	return JSON.stringify(createEvent(type, data));
}

/**
 * Parse an incoming client message
 */
export function parseClientMessage(
	data: string,
): { type: keyof ClientToServerEvents; payload: unknown } | null {
	try {
		const parsed = JSON.parse(data);
		if (typeof parsed !== "object" || !parsed.type) {
			return null;
		}
		return {
			type: parsed.type as keyof ClientToServerEvents,
			payload: parsed.data ?? parsed.payload ?? {},
		};
	} catch {
		return null;
	}
}
