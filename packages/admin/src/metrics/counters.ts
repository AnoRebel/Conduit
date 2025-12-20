/**
 * Simple monotonically increasing counter
 */
export class Counter {
	private _value = 0;

	get value(): number {
		return this._value;
	}

	increment(amount: number = 1): void {
		if (amount < 0) {
			throw new Error("Counter can only be incremented by positive values");
		}
		this._value += amount;
	}

	reset(): void {
		this._value = 0;
	}
}

/**
 * Map of named counters for tracking categorized counts
 */
export class CounterMap {
	private readonly _counters = new Map<string, number>();

	increment(key: string, amount: number = 1): void {
		if (amount < 0) {
			throw new Error("Counter can only be incremented by positive values");
		}
		const current = this._counters.get(key) ?? 0;
		this._counters.set(key, current + amount);
	}

	get(key: string): number {
		return this._counters.get(key) ?? 0;
	}

	getAll(): Record<string, number> {
		const result: Record<string, number> = {};
		for (const [key, value] of this._counters) {
			result[key] = value;
		}
		return result;
	}

	keys(): string[] {
		return Array.from(this._counters.keys());
	}

	total(): number {
		let sum = 0;
		for (const value of this._counters.values()) {
			sum += value;
		}
		return sum;
	}

	reset(): void {
		this._counters.clear();
	}

	delete(key: string): boolean {
		return this._counters.delete(key);
	}
}
