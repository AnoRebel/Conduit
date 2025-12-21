export interface TimeSeriesPoint {
	timestamp: number;
	value: number;
}

/**
 * Circular buffer for efficient time series storage
 * Automatically overwrites oldest entries when capacity is reached
 */
export class CircularTimeSeries {
	private readonly _buffer: TimeSeriesPoint[];
	private readonly _capacity: number;
	private _head = 0;
	private _size = 0;

	constructor(capacity: number) {
		if (capacity <= 0) {
			throw new Error("Capacity must be positive");
		}
		this._capacity = capacity;
		this._buffer = new Array(capacity);
	}

	get size(): number {
		return this._size;
	}

	get capacity(): number {
		return this._capacity;
	}

	/**
	 * Record a value at the current timestamp
	 */
	record(value: number, timestamp: number = Date.now()): void {
		this._buffer[this._head] = { timestamp, value };
		this._head = (this._head + 1) % this._capacity;
		if (this._size < this._capacity) {
			this._size++;
		}
	}

	/**
	 * Get all points in chronological order
	 */
	getAll(): TimeSeriesPoint[] {
		if (this._size === 0) {
			return [];
		}

		const result: TimeSeriesPoint[] = new Array(this._size);

		if (this._size < this._capacity) {
			// Buffer not full yet, points are 0 to size-1
			for (let i = 0; i < this._size; i++) {
				const point = this._buffer[i];
				if (point) {
					result[i] = point;
				}
			}
		} else {
			// Buffer is full, oldest is at head
			for (let i = 0; i < this._capacity; i++) {
				const idx = (this._head + i) % this._capacity;
				const point = this._buffer[idx];
				if (point) {
					result[i] = point;
				}
			}
		}

		return result;
	}

	/**
	 * Get points within a time range
	 */
	getRange(startTime: number, endTime: number): TimeSeriesPoint[] {
		return this.getAll().filter(p => p.timestamp >= startTime && p.timestamp <= endTime);
	}

	/**
	 * Get the most recent N points
	 */
	getRecent(count: number): TimeSeriesPoint[] {
		const all = this.getAll();
		if (count >= all.length) {
			return all;
		}
		return all.slice(all.length - count);
	}

	/**
	 * Get the most recent point
	 */
	getLast(): TimeSeriesPoint | undefined {
		if (this._size === 0) {
			return undefined;
		}
		const lastIdx = (this._head - 1 + this._capacity) % this._capacity;
		return this._buffer[lastIdx];
	}

	/**
	 * Calculate statistics over the current data
	 */
	getStats(): TimeSeriesStats {
		const points = this.getAll();

		if (points.length === 0) {
			return {
				count: 0,
				min: 0,
				max: 0,
				avg: 0,
				sum: 0,
				first: undefined,
				last: undefined,
			};
		}

		const firstPoint = points[0];
		if (!firstPoint) {
			return {
				count: 0,
				min: 0,
				max: 0,
				avg: 0,
				sum: 0,
				first: undefined,
				last: undefined,
			};
		}

		let min = firstPoint.value;
		let max = firstPoint.value;
		let sum = 0;

		for (const point of points) {
			if (point.value < min) min = point.value;
			if (point.value > max) max = point.value;
			sum += point.value;
		}

		return {
			count: points.length,
			min,
			max,
			avg: sum / points.length,
			sum,
			first: points[0],
			last: points[points.length - 1],
		};
	}

	/**
	 * Calculate rate of change (per second) between first and last points
	 */
	getRatePerSecond(): number {
		const points = this.getAll();
		if (points.length < 2) {
			return 0;
		}

		const first = points[0];
		const last = points[points.length - 1];

		if (!first || !last) {
			return 0;
		}

		const timeDeltaSeconds = (last.timestamp - first.timestamp) / 1000;

		if (timeDeltaSeconds <= 0) {
			return 0;
		}

		return (last.value - first.value) / timeDeltaSeconds;
	}

	/**
	 * Clear all data
	 */
	clear(): void {
		this._head = 0;
		this._size = 0;
	}
}

export interface TimeSeriesStats {
	count: number;
	min: number;
	max: number;
	avg: number;
	sum: number;
	first: TimeSeriesPoint | undefined;
	last: TimeSeriesPoint | undefined;
}

/**
 * Named collection of time series
 */
export class TimeSeriesMap {
	private readonly _series = new Map<string, CircularTimeSeries>();
	private readonly _defaultCapacity: number;

	constructor(defaultCapacity: number = 60) {
		this._defaultCapacity = defaultCapacity;
	}

	private _getOrCreate(key: string): CircularTimeSeries {
		let series = this._series.get(key);
		if (!series) {
			series = new CircularTimeSeries(this._defaultCapacity);
			this._series.set(key, series);
		}
		return series;
	}

	record(key: string, value: number, timestamp?: number): void {
		this._getOrCreate(key).record(value, timestamp);
	}

	get(key: string): CircularTimeSeries | undefined {
		return this._series.get(key);
	}

	getAll(key: string): TimeSeriesPoint[] {
		return this._series.get(key)?.getAll() ?? [];
	}

	getStats(key: string): TimeSeriesStats | undefined {
		return this._series.get(key)?.getStats();
	}

	keys(): string[] {
		return Array.from(this._series.keys());
	}

	clear(): void {
		this._series.clear();
	}

	clearSeries(key: string): void {
		this._series.get(key)?.clear();
	}

	delete(key: string): boolean {
		return this._series.delete(key);
	}
}
