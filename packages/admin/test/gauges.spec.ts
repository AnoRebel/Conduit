import { beforeEach, describe, expect, it } from "vitest";
import { Gauge, GaugeMap } from "../src/metrics/gauges.js";

describe("Gauge", () => {
	let gauge: Gauge;

	beforeEach(() => {
		gauge = new Gauge();
	});

	describe("initial state", () => {
		it("should start at 0", () => {
			expect(gauge.value).toBe(0);
		});

		it("should have min at 0", () => {
			expect(gauge.min).toBe(0);
		});

		it("should have max at 0", () => {
			expect(gauge.max).toBe(0);
		});
	});

	describe("set", () => {
		it("should set value", () => {
			gauge.set(50);
			expect(gauge.value).toBe(50);
		});

		it("should update max when setting higher value", () => {
			gauge.set(100);
			expect(gauge.max).toBe(100);
		});

		it("should update min when setting lower value", () => {
			gauge.set(-10);
			expect(gauge.min).toBe(-10);
		});

		it("should track both min and max", () => {
			gauge.set(50);
			gauge.set(-20);
			gauge.set(100);
			gauge.set(30);
			expect(gauge.min).toBe(-20);
			expect(gauge.max).toBe(100);
			expect(gauge.value).toBe(30);
		});
	});

	describe("increment", () => {
		it("should increment by 1 by default", () => {
			gauge.increment();
			expect(gauge.value).toBe(1);
		});

		it("should increment by specified amount", () => {
			gauge.increment(10);
			expect(gauge.value).toBe(10);
		});

		it("should update max on increment", () => {
			gauge.increment(50);
			gauge.increment(30);
			expect(gauge.max).toBe(80);
		});
	});

	describe("decrement", () => {
		it("should decrement by 1 by default", () => {
			gauge.set(10);
			gauge.decrement();
			expect(gauge.value).toBe(9);
		});

		it("should decrement by specified amount", () => {
			gauge.set(100);
			gauge.decrement(30);
			expect(gauge.value).toBe(70);
		});

		it("should update min on decrement", () => {
			gauge.decrement(10);
			expect(gauge.min).toBe(-10);
		});

		it("should handle going negative", () => {
			gauge.decrement(5);
			expect(gauge.value).toBe(-5);
			expect(gauge.min).toBe(-5);
		});
	});

	describe("reset", () => {
		it("should reset value, min, and max to 0", () => {
			gauge.set(100);
			gauge.set(-50);
			gauge.reset();
			expect(gauge.value).toBe(0);
			expect(gauge.min).toBe(0);
			expect(gauge.max).toBe(0);
		});
	});

	describe("resetMinMax", () => {
		it("should reset min and max to current value", () => {
			gauge.set(100);
			gauge.set(-50);
			gauge.set(25);
			gauge.resetMinMax();
			expect(gauge.value).toBe(25);
			expect(gauge.min).toBe(25);
			expect(gauge.max).toBe(25);
		});

		it("should start tracking new min/max after reset", () => {
			gauge.set(100);
			gauge.set(-50);
			gauge.set(25);
			gauge.resetMinMax();

			gauge.set(30);
			gauge.set(20);

			expect(gauge.min).toBe(20);
			expect(gauge.max).toBe(30);
		});
	});
});

describe("GaugeMap", () => {
	let gaugeMap: GaugeMap;

	beforeEach(() => {
		gaugeMap = new GaugeMap();
	});

	describe("set", () => {
		it("should create new gauge for unknown key", () => {
			gaugeMap.set("connections", 10);
			expect(gaugeMap.get("connections")).toBe(10);
		});

		it("should update existing gauge", () => {
			gaugeMap.set("memory", 1000);
			gaugeMap.set("memory", 2000);
			expect(gaugeMap.get("memory")).toBe(2000);
		});
	});

	describe("increment", () => {
		it("should increment gauge", () => {
			gaugeMap.increment("active");
			expect(gaugeMap.get("active")).toBe(1);
		});

		it("should increment by specified amount", () => {
			gaugeMap.increment("users", 5);
			expect(gaugeMap.get("users")).toBe(5);
		});
	});

	describe("decrement", () => {
		it("should decrement gauge", () => {
			gaugeMap.set("count", 10);
			gaugeMap.decrement("count");
			expect(gaugeMap.get("count")).toBe(9);
		});

		it("should decrement by specified amount", () => {
			gaugeMap.set("value", 100);
			gaugeMap.decrement("value", 30);
			expect(gaugeMap.get("value")).toBe(70);
		});

		it("should create gauge if not exists", () => {
			gaugeMap.decrement("new");
			expect(gaugeMap.get("new")).toBe(-1);
		});
	});

	describe("get", () => {
		it("should return 0 for unknown key", () => {
			expect(gaugeMap.get("unknown")).toBe(0);
		});
	});

	describe("getGauge", () => {
		it("should return undefined for unknown key", () => {
			expect(gaugeMap.getGauge("unknown")).toBeUndefined();
		});

		it("should return gauge instance", () => {
			gaugeMap.set("test", 50);
			const gauge = gaugeMap.getGauge("test");
			expect(gauge).toBeInstanceOf(Gauge);
			expect(gauge?.value).toBe(50);
		});

		it("should allow accessing min/max through gauge", () => {
			// Start with a negative value to test min tracking
			gaugeMap.set("metric", -10);
			gaugeMap.set("metric", 100);
			gaugeMap.set("metric", 75);

			const gauge = gaugeMap.getGauge("metric");
			expect(gauge?.min).toBe(-10);
			expect(gauge?.max).toBe(100);
			expect(gauge?.value).toBe(75);
		});
	});

	describe("getAll", () => {
		it("should return empty object for no gauges", () => {
			expect(gaugeMap.getAll()).toEqual({});
		});

		it("should return all gauge values", () => {
			gaugeMap.set("a", 1);
			gaugeMap.set("b", 2);
			gaugeMap.set("c", 3);
			expect(gaugeMap.getAll()).toEqual({ a: 1, b: 2, c: 3 });
		});
	});

	describe("keys", () => {
		it("should return empty array for no gauges", () => {
			expect(gaugeMap.keys()).toEqual([]);
		});

		it("should return all keys", () => {
			gaugeMap.set("x", 1);
			gaugeMap.set("y", 2);
			const keys = gaugeMap.keys();
			expect(keys).toHaveLength(2);
			expect(keys).toContain("x");
			expect(keys).toContain("y");
		});
	});

	describe("reset", () => {
		it("should clear all gauges", () => {
			gaugeMap.set("a", 10);
			gaugeMap.set("b", 20);
			gaugeMap.reset();
			expect(gaugeMap.keys()).toHaveLength(0);
		});
	});

	describe("delete", () => {
		it("should remove specific gauge", () => {
			gaugeMap.set("a", 10);
			gaugeMap.set("b", 20);
			expect(gaugeMap.delete("a")).toBe(true);
			expect(gaugeMap.get("a")).toBe(0);
			expect(gaugeMap.get("b")).toBe(20);
		});

		it("should return false for non-existent key", () => {
			expect(gaugeMap.delete("unknown")).toBe(false);
		});
	});
});
