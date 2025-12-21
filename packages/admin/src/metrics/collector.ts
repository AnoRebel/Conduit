import type { MetricsConfig } from "../config.js";
import type { ErrorMetrics, MemoryUsage, MetricsSnapshot } from "../types.js";
import { Counter, CounterMap } from "./counters.js";
import { Gauge } from "./gauges.js";
import { CircularTimeSeries } from "./timeseries.js";

export interface MetricsCollector {
	// Counters
	readonly connectionsOpened: Counter;
	readonly connectionsClosed: Counter;
	readonly messagesRelayed: Counter;
	readonly messagesQueued: Counter;
	readonly rateLimitHits: Counter;
	readonly rateLimitRejections: Counter;
	readonly errors: CounterMap;

	// Gauges
	readonly activeConnections: Gauge;
	readonly queuedMessages: Gauge;

	// Time series
	readonly throughput: CircularTimeSeries;
	readonly latency: CircularTimeSeries;

	// Methods
	getSnapshot(): MetricsSnapshot;
	getHistory(startTime: number, endTime: number): MetricsSnapshot[];
	recordError(type: string): void;
	reset(): void;
	destroy(): void;

	// Peak tracking
	readonly peakConnections: number;
}

export function createMetricsCollector(config: MetricsConfig): MetricsCollector {
	// Counters
	const connectionsOpened = new Counter();
	const connectionsClosed = new Counter();
	const messagesRelayed = new Counter();
	const messagesQueued = new Counter();
	const rateLimitHits = new Counter();
	const rateLimitRejections = new Counter();
	const errors = new CounterMap();

	// Gauges
	const activeConnections = new Gauge();
	const queuedMessages = new Gauge();

	// Time series
	const throughput = new CircularTimeSeries(config.maxSnapshots);
	const latency = new CircularTimeSeries(config.maxSnapshots);

	// Peak tracking
	let peakConnections = 0;

	// Snapshot history
	const snapshots: MetricsSnapshot[] = [];
	let snapshotInterval: ReturnType<typeof setInterval> | null = null;

	// Track throughput
	let lastMessageCount = 0;
	let lastThroughputTime = Date.now();

	function getMemoryUsage(): MemoryUsage {
		const mem = process.memoryUsage();
		return {
			heapUsed: mem.heapUsed,
			heapTotal: mem.heapTotal,
			external: mem.external,
			rss: mem.rss,
		};
	}

	function getErrorMetrics(): ErrorMetrics {
		const byType = errors.getAll();
		let total = 0;
		for (const count of Object.values(byType)) {
			total += count;
		}
		return { total, byType };
	}

	function calculateThroughput(): number {
		const now = Date.now();
		const elapsed = (now - lastThroughputTime) / 1000;
		const currentCount = messagesRelayed.value;
		const messageDelta = currentCount - lastMessageCount;

		lastMessageCount = currentCount;
		lastThroughputTime = now;

		if (elapsed <= 0) return 0;
		return Math.round(messageDelta / elapsed);
	}

	function getSnapshot(): MetricsSnapshot {
		const currentConnections = activeConnections.value;
		if (currentConnections > peakConnections) {
			peakConnections = currentConnections;
		}

		const tps = calculateThroughput();
		throughput.record(tps);

		return {
			timestamp: Date.now(),
			clients: {
				total: connectionsOpened.value,
				connected: currentConnections,
				peak: peakConnections,
			},
			messages: {
				relayed: messagesRelayed.value,
				queued: queuedMessages.value,
				throughputPerSecond: tps,
			},
			rateLimit: {
				hits: rateLimitHits.value,
				rejections: rateLimitRejections.value,
			},
			errors: getErrorMetrics(),
			memory: getMemoryUsage(),
		};
	}

	function getHistory(startTime: number, endTime: number): MetricsSnapshot[] {
		return snapshots.filter(s => s.timestamp >= startTime && s.timestamp <= endTime);
	}

	function recordError(type: string): void {
		errors.increment(type);
	}

	function reset(): void {
		connectionsOpened.reset();
		connectionsClosed.reset();
		messagesRelayed.reset();
		messagesQueued.reset();
		rateLimitHits.reset();
		rateLimitRejections.reset();
		errors.reset();
		activeConnections.set(0);
		queuedMessages.set(0);
		throughput.clear();
		latency.clear();
		snapshots.length = 0;
		peakConnections = 0;
		lastMessageCount = 0;
		lastThroughputTime = Date.now();
	}

	function startSnapshotCollection(): void {
		snapshotInterval = setInterval(() => {
			const snapshot = getSnapshot();
			snapshots.push(snapshot);

			// Trim old snapshots
			const cutoff = Date.now() - config.retentionMs;
			while (snapshots.length > 0 && snapshots[0] && snapshots[0].timestamp < cutoff) {
				snapshots.shift();
			}

			// Also enforce max snapshots
			while (snapshots.length > config.maxSnapshots) {
				snapshots.shift();
			}
		}, config.snapshotIntervalMs);

		if (snapshotInterval.unref) {
			snapshotInterval.unref();
		}
	}

	function destroy(): void {
		if (snapshotInterval) {
			clearInterval(snapshotInterval);
			snapshotInterval = null;
		}
	}

	// Start collecting snapshots
	startSnapshotCollection();

	return {
		connectionsOpened,
		connectionsClosed,
		messagesRelayed,
		messagesQueued,
		rateLimitHits,
		rateLimitRejections,
		errors,
		activeConnections,
		queuedMessages,
		throughput,
		latency,
		getSnapshot,
		getHistory,
		recordError,
		reset,
		destroy,
		get peakConnections() {
			return peakConnections;
		},
	};
}
