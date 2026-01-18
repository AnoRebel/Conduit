import { beforeEach, describe, expect, it } from "vitest";
import { Counter, CounterMap } from "../src/metrics/counters.js";

describe("Counter", () => {
	let counter: Counter;

	beforeEach(() => {
		counter = new Counter();
	});

	describe("initial state", () => {
		it("should start at 0", () => {
			expect(counter.value).toBe(0);
		});
	});

	describe("increment", () => {
		it("should increment by 1 by default", () => {
			counter.increment();
			expect(counter.value).toBe(1);
		});

		it("should increment by specified amount", () => {
			counter.increment(5);
			expect(counter.value).toBe(5);
		});

		it("should accumulate multiple increments", () => {
			counter.increment(10);
			counter.increment(20);
			counter.increment(30);
			expect(counter.value).toBe(60);
		});

		it("should throw error for negative values", () => {
			expect(() => counter.increment(-1)).toThrow(
				"Counter can only be incremented by positive values"
			);
		});

		it("should accept zero", () => {
			counter.increment(0);
			expect(counter.value).toBe(0);
		});
	});

	describe("reset", () => {
		it("should reset value to 0", () => {
			counter.increment(100);
			counter.reset();
			expect(counter.value).toBe(0);
		});

		it("should allow incrementing after reset", () => {
			counter.increment(50);
			counter.reset();
			counter.increment(25);
			expect(counter.value).toBe(25);
		});
	});
});

describe("CounterMap", () => {
	let counterMap: CounterMap;

	beforeEach(() => {
		counterMap = new CounterMap();
	});

	describe("increment", () => {
		it("should create new counter for unknown key", () => {
			counterMap.increment("requests");
			expect(counterMap.get("requests")).toBe(1);
		});

		it("should increment existing counter", () => {
			counterMap.increment("requests");
			counterMap.increment("requests");
			expect(counterMap.get("requests")).toBe(2);
		});

		it("should increment by specified amount", () => {
			counterMap.increment("bytes", 1024);
			expect(counterMap.get("bytes")).toBe(1024);
		});

		it("should throw for negative values", () => {
			expect(() => counterMap.increment("test", -1)).toThrow();
		});
	});

	describe("get", () => {
		it("should return 0 for unknown key", () => {
			expect(counterMap.get("unknown")).toBe(0);
		});

		it("should return current value for known key", () => {
			counterMap.increment("test", 42);
			expect(counterMap.get("test")).toBe(42);
		});
	});

	describe("getAll", () => {
		it("should return empty object for no counters", () => {
			expect(counterMap.getAll()).toEqual({});
		});

		it("should return all counters", () => {
			counterMap.increment("a", 1);
			counterMap.increment("b", 2);
			counterMap.increment("c", 3);
			expect(counterMap.getAll()).toEqual({ a: 1, b: 2, c: 3 });
		});
	});

	describe("keys", () => {
		it("should return empty array for no counters", () => {
			expect(counterMap.keys()).toEqual([]);
		});

		it("should return all keys", () => {
			counterMap.increment("x");
			counterMap.increment("y");
			counterMap.increment("z");
			expect(counterMap.keys()).toHaveLength(3);
			expect(counterMap.keys()).toContain("x");
			expect(counterMap.keys()).toContain("y");
			expect(counterMap.keys()).toContain("z");
		});
	});

	describe("total", () => {
		it("should return 0 for no counters", () => {
			expect(counterMap.total()).toBe(0);
		});

		it("should return sum of all counters", () => {
			counterMap.increment("a", 10);
			counterMap.increment("b", 20);
			counterMap.increment("c", 30);
			expect(counterMap.total()).toBe(60);
		});
	});

	describe("reset", () => {
		it("should clear all counters", () => {
			counterMap.increment("a", 10);
			counterMap.increment("b", 20);
			counterMap.reset();
			expect(counterMap.keys()).toHaveLength(0);
			expect(counterMap.total()).toBe(0);
		});
	});

	describe("delete", () => {
		it("should remove specific counter", () => {
			counterMap.increment("a", 10);
			counterMap.increment("b", 20);
			expect(counterMap.delete("a")).toBe(true);
			expect(counterMap.keys()).toEqual(["b"]);
		});

		it("should return false for non-existent key", () => {
			expect(counterMap.delete("unknown")).toBe(false);
		});
	});
});
