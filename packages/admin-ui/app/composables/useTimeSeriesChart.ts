import { TZDate } from "@date-fns/tz";
import { areaY, barY, defineChart, lineY } from "@tanstack/charts";
import { scaleBand, scaleLinear, scaleUtc } from "d3-scale";
import { format } from "date-fns";

/**
 * One point on a metrics time series.
 *
 * `at` is a `Date` rather than an epoch number because the temporal scale
 * requires Date channel values; passing a number fails at render time with
 * "A temporal scale factory requires Date channel values".
 */
export interface TimeSeriesPoint {
	at: Date;
	value: number;
}

/** Presentation for a metrics series. */
export interface TimeSeriesChartOptions {
	/** Line and fill colour, as a CSS colour string. */
	color: string;
	/** Series label, used in the accessible description. */
	label: string;
	/** Fill the area beneath the line (default: true). */
	fill?: boolean;
}

/** Accept either an epoch or a Date, since both appear across the surface. */
function toEpoch(value: number | Date): number {
	return typeof value === "number" ? value : value.getTime();
}

/** The viewer's own timezone, resolved per call so a changed setting is picked up. */
function localZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Format a metrics timestamp in the viewer's timezone.
 *
 * The zone is explicit rather than implicit in the runtime, because the
 * dashboard is routinely watched from a different zone than the server runs in.
 */
export function formatMetricTime(timestamp: number | Date): string {
	return format(new TZDate(toEpoch(timestamp), localZone()), "HH:mm:ss");
}

/** Format a metrics timestamp with its date, for longer ranges. */
export function formatMetricDateTime(timestamp: number | Date): string {
	return format(new TZDate(toEpoch(timestamp), localZone()), "d MMM HH:mm:ss");
}

/** Format a timestamp as a relative age, for tables. */
export function formatMetricDate(timestamp: number | Date): string {
	return format(new TZDate(toEpoch(timestamp), localZone()), "d MMM yyyy, HH:mm");
}

/**
 * Average a metrics series over the most recent `windowMs` of samples.
 *
 * Throughput is reported as whole messages per second, so a spiky-but-low rate
 * alternates between values like 0 and 13 from one snapshot to the next. A card
 * that renders the single latest sample therefore reads "0 msg/s" on a server
 * that is steadily busy, purely because of which instant it caught.
 *
 * The window is expressed in milliseconds rather than a number of samples
 * because the snapshot interval is configurable: counting samples would average
 * over a different span of time on different servers.
 *
 * Falls back to the latest value when no sample falls inside the window, and
 * returns 0 for an empty series, so a fresh dashboard shows a number rather
 * than a blank.
 */
export function averageOverWindow(points: readonly TimeSeriesPoint[], windowMs = 30_000): number {
	if (points.length === 0) return 0;

	const newest = points[points.length - 1];
	if (!newest) return 0;

	const cutoff = newest.at.getTime() - windowMs;
	const recent = points.filter(p => p.at.getTime() >= cutoff);
	if (recent.length === 0) return newest.value;

	const total = recent.reduce((sum, p) => sum + p.value, 0);
	return Math.round(total / recent.length);
}

/**
 * Build a chart definition for a metrics time series.
 *
 * Marks consume the data directly, so there is no parallel labels array to be
 * kept in step with the values — the drift the previous chart.js shape invited.
 */
export function buildTimeSeriesDefinition(
	points: readonly TimeSeriesPoint[],
	options: TimeSeriesChartOptions
) {
	const data = [...points];
	const marks = [];

	if (options.fill !== false) {
		marks.push(
			areaY(data, {
				x: (d: TimeSeriesPoint) => d.at,
				y: (d: TimeSeriesPoint) => d.value,
				fill: options.color,
				fillOpacity: 0.12,
			})
		);
	}

	marks.push(
		lineY(data, {
			x: (d: TimeSeriesPoint) => d.at,
			y: (d: TimeSeriesPoint) => d.value,
			stroke: options.color,
			strokeWidth: 2,
		})
	);

	// Both reserved scales must be defined explicitly; the engine refuses to
	// render without them.
	return defineChart({
		marks,
		scales: {
			x: { scale: scaleUtc },
			y: { scale: scaleLinear, nice: true, grid: true },
		},
	});
}

/** A reactive time-series definition derived from a metrics series. */
export function useTimeSeriesChart(
	points: MaybeRefOrGetter<readonly TimeSeriesPoint[]>,
	options: MaybeRefOrGetter<TimeSeriesChartOptions>
) {
	return computed(() => buildTimeSeriesDefinition(toValue(points), toValue(options)));
}

/** One named series in a multi-series chart. */
export interface NamedSeries {
	points: readonly TimeSeriesPoint[];
	color: string;
	label: string;
}

/**
 * Build a definition plotting several series on one pair of axes.
 *
 * A single shared y scale rather than the old dual-axis arrangement: two
 * independent axes on one plot make the lines look comparable when they are
 * not, which is a misreading the reader cannot see.
 */
export function buildMultiSeriesDefinition(series: readonly NamedSeries[]) {
	const marks = series.map(s =>
		lineY([...s.points], {
			x: (d: TimeSeriesPoint) => d.at,
			y: (d: TimeSeriesPoint) => d.value,
			stroke: s.color,
			strokeWidth: 2,
		})
	);

	return defineChart({
		marks,
		scales: {
			x: { scale: scaleUtc },
			y: { scale: scaleLinear, nice: true, grid: true },
		},
	});
}

/** A reactive multi-series definition. */
export function useMultiSeriesChart(series: MaybeRefOrGetter<readonly NamedSeries[]>) {
	return computed(() => buildMultiSeriesDefinition(toValue(series)));
}

/** One bar in a categorical distribution. */
export interface CategoryPoint {
	label: string;
	value: number;
}

/** Build a categorical bar definition, for distributions rather than series. */
export function buildBarDefinition(rows: readonly CategoryPoint[], color: string) {
	const data = [...rows];
	return defineChart({
		marks: [
			barY(data, {
				x: (d: CategoryPoint) => d.label,
				y: (d: CategoryPoint) => d.value,
				fill: color,
			}),
		],
		scales: {
			x: { scale: scaleBand },
			y: { scale: scaleLinear, nice: true, grid: true },
		},
	});
}

/** A reactive bar definition. */
export function useBarChart(
	rows: MaybeRefOrGetter<readonly CategoryPoint[]>,
	color: MaybeRefOrGetter<string>
) {
	return computed(() => buildBarDefinition(toValue(rows), toValue(color)));
}
