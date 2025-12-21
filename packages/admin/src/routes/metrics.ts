import type { Route } from "./index.js";
import { error, json } from "./index.js";

export const metricsRoutes: Route[] = [
	{
		method: "GET",
		path: "/metrics",
		requiresAuth: true,
		handler: ctx => {
			const snapshot = ctx.admin.getMetricsSnapshot();
			return json(snapshot);
		},
	},
	{
		method: "GET",
		path: "/metrics/history",
		requiresAuth: true,
		handler: ctx => {
			const { start, end, duration } = ctx.query;

			let startTime: number;
			let endTime: number;

			if (duration) {
				// Parse duration like "1h", "30m", "24h"
				const match = duration.match(/^(\d+)(m|h|d)$/);
				if (!match || !match[1] || !match[2]) {
					return error("Invalid duration format. Use format like '30m', '1h', '24h'");
				}

				const value = parseInt(match[1], 10);
				const unit = match[2];

				const multipliers: Record<string, number> = {
					m: 60 * 1000,
					h: 60 * 60 * 1000,
					d: 24 * 60 * 60 * 1000,
				};

				const multiplier = multipliers[unit];
				if (!multiplier) {
					return error("Invalid duration unit");
				}

				endTime = Date.now();
				startTime = endTime - value * multiplier;
			} else if (start && end) {
				startTime = parseInt(start, 10);
				endTime = parseInt(end, 10);

				if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
					return error("Invalid start or end timestamp");
				}
			} else {
				// Default to last hour
				endTime = Date.now();
				startTime = endTime - 60 * 60 * 1000;
			}

			const history = ctx.admin.getMetricsHistory(startTime, endTime);

			return json({
				startTime,
				endTime,
				snapshots: history,
				count: history.length,
			});
		},
	},
	{
		method: "GET",
		path: "/metrics/throughput",
		requiresAuth: true,
		handler: ctx => {
			const stats = ctx.admin.metrics.throughput.getStats();
			const recent = ctx.admin.metrics.throughput.getRecent(60);

			return json({
				current: stats.last?.value ?? 0,
				average: stats.avg,
				peak: stats.max,
				history: recent,
			});
		},
	},
	{
		method: "GET",
		path: "/metrics/latency",
		requiresAuth: true,
		handler: ctx => {
			const stats = ctx.admin.metrics.latency.getStats();
			const recent = ctx.admin.metrics.latency.getRecent(60);

			return json({
				current: stats.last?.value ?? 0,
				average: stats.avg,
				p99: stats.max, // Simplified - would need percentile calculation
				history: recent,
			});
		},
	},
	{
		method: "GET",
		path: "/metrics/errors",
		requiresAuth: true,
		handler: ctx => {
			const snapshot = ctx.admin.getMetricsSnapshot();

			return json({
				total: snapshot.errors.total,
				byType: snapshot.errors.byType,
			});
		},
	},
	{
		method: "POST",
		path: "/metrics/reset",
		requiresAuth: true,
		handler: ctx => {
			const userId = ctx.auth.userId ?? "unknown";

			ctx.admin.metrics.reset();
			ctx.admin.audit.log("reset_metrics", userId);

			return json({ success: true, message: "Metrics reset" });
		},
	},
];
