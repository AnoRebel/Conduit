/**
 * Gauge for tracking values that can go up and down
 */
export class Gauge {
	private _value = 0;
	private _min = 0;
	private _max = 0;

	get value(): number {
		return this._value;
	}

	get min(): number {
		return this._min;
	}

	get max(): number {
		return this._max;
	}

	set(value: number): void {
		this._value = value;
		if (value < this._min) {
			this._min = value;
		}
		if (value > this._max) {
			this._max = value;
		}
	}

	increment(amount: number = 1): void {
		this.set(this._value + amount);
	}

	decrement(amount: number = 1): void {
		this.set(this._value - amount);
	}

	reset(): void {
		this._value = 0;
		this._min = 0;
		this._max = 0;
	}

	/**
	 * Reset min/max tracking while keeping current value
	 */
	resetMinMax(): void {
		this._min = this._value;
		this._max = this._value;
	}
}

/**
 * Map of named gauges for tracking categorized values
 */
export class GaugeMap {
	private readonly _gauges = new Map<string, Gauge>();

	private _getOrCreate(key: string): Gauge {
		let gauge = this._gauges.get(key);
		if (!gauge) {
			gauge = new Gauge();
			this._gauges.set(key, gauge);
		}
		return gauge;
	}

	set(key: string, value: number): void {
		this._getOrCreate(key).set(value);
	}

	increment(key: string, amount: number = 1): void {
		this._getOrCreate(key).increment(amount);
	}

	decrement(key: string, amount: number = 1): void {
		this._getOrCreate(key).decrement(amount);
	}

	get(key: string): number {
		return this._gauges.get(key)?.value ?? 0;
	}

	getGauge(key: string): Gauge | undefined {
		return this._gauges.get(key);
	}

	getAll(): Record<string, number> {
		const result: Record<string, number> = {};
		for (const [key, gauge] of this._gauges) {
			result[key] = gauge.value;
		}
		return result;
	}

	keys(): string[] {
		return Array.from(this._gauges.keys());
	}

	reset(): void {
		this._gauges.clear();
	}

	delete(key: string): boolean {
		return this._gauges.delete(key);
	}
}
