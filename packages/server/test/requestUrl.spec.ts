import { describe, expect, it } from "vitest";
import { parseRequestUrl } from "../src/core/requestUrl.js";

describe("parseRequestUrl", () => {
	it("splits path and query", () => {
		expect(parseRequestUrl("/conduit?key=k&id=a&token=t")).toEqual({
			pathname: "/conduit",
			query: { key: "k", id: "a", token: "t" },
		});
	});

	it("keeps a leading // as path, not host", () => {
		expect(parseRequestUrl("//evil.example/k/id").pathname).toBe("//evil.example/k/id");
	});

	it("handles absolute-form and missing urls", () => {
		expect(parseRequestUrl("http://proxy.example/k/id?x=1")).toEqual({
			pathname: "/k/id",
			query: { x: "1" },
		});
		expect(parseRequestUrl(undefined)).toEqual({ pathname: "/", query: {} });
	});
});
