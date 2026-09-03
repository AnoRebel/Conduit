/**
 * Throughput smoothing for the metrics cards.
 *
 * `throughputPerSecond` is a whole number of messages per second, so a low but
 * steady rate alternates between values like 0 and 13 across consecutive
 * snapshots. Rendering the newest sample made the dashboard read "0 msg/s" on a
 * server that was plainly busy, which is what this smoothing exists to fix.
 *
 * Run with `bun test test/metricsAverage.spec.ts`.
 */

import { describe, expect, test } from "bun:test";
import { averageOverWindow } from "../app/composables/useTimeSeriesChart";

/** Build a series ending at `now`, one sample per second, oldest first. */
function series(values: number[], now = Date.UTC(2026, 0, 1, 12, 0, 0)) {
	return values.map((value, i) => ({
		at: new Date(now - (values.length - 1 - i) * 1000),
		value,
	}));
}

describe("averageOverWindow", () => {
	test("averages a spiky series rather than reporting its last sample", () => {
		// The real failure: the newest sample is 0 while the true rate is ~6.
		const points = series([13, 3, 5, 8, 7, 6, 0]);
		expect(points[points.length - 1]?.value).toBe(0);
		expect(averageOverWindow(points)).toBe(6);
	});

	test("ignores samples older than the window", () => {
		// A long-past burst must not inflate the current reading.
		const now = Date.UTC(2026, 0, 1, 12, 0, 0);
		const old = [{ at: new Date(now - 120_000), value: 1000 }];
		const recent = series([4, 4, 4], now);
		expect(averageOverWindow([...old, ...recent], 30_000)).toBe(4);
	});

	test("honours a custom window", () => {
		const points = series([100, 100, 2, 2, 2]);
		// Samples sit 1s apart, so a 2s window spans the newest three.
		expect(averageOverWindow(points, 2_000)).toBe(2);
		// Widening it to 4s pulls both spikes back in, raising the average.
		expect(averageOverWindow(points, 4_000)).toBe(41);
	});

	test("returns 0 for an empty series", () => {
		// A dashboard with no history yet shows a number, not a blank.
		expect(averageOverWindow([])).toBe(0);
	});

	test("returns the only sample when the series has one point", () => {
		expect(averageOverWindow(series([42]))).toBe(42);
	});

	test("falls back to the newest value when nothing fits the window", () => {
		// A zero-width window excludes everything except by the fallback path.
		const points = series([5, 9]);
		expect(averageOverWindow(points, -1)).toBe(9);
	});

	test("rounds to a whole number of messages per second", () => {
		// 1+2 over two samples is 1.5, which must not render as "1.5 msg/s".
		expect(Number.isInteger(averageOverWindow(series([1, 2])))).toBe(true);
	});

	test("stays 0 for a genuinely idle server", () => {
		// Smoothing must not invent traffic that is not there.
		expect(averageOverWindow(series([0, 0, 0, 0]))).toBe(0);
	});
});
