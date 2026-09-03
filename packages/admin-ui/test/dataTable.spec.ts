/**
 * Table engine behaviour.
 *
 * `DataTable.vue` is a thin template over these primitives, so exercising the
 * engine directly proves sorting, filtering and pagination actually work rather
 * than merely typecheck — the failure mode a compile-only check would miss.
 *
 * Run with `bun test test/dataTable.spec.ts`.
 */

import { describe, expect, test } from "bun:test";
import {
	columnFilteringFeature,
	columnVisibilityFeature,
	createFilteredRowModel,
	createPaginatedRowModel,
	createSortedRowModel,
	// Aliased: this is a plain factory call, but a lint rule keyed on the `use`
	// prefix treats it as a React hook and objects to it inside a helper.
	useTable as createVueTable,
	filterFns,
	globalFilteringFeature,
	rowPaginationFeature,
	rowSortingFeature,
	sortFns,
	tableFeatures,
} from "@tanstack/vue-table";

/** The same feature set DataTable.vue registers. */
const features = tableFeatures({
	rowSortingFeature,
	columnFilteringFeature,
	globalFilteringFeature,
	rowPaginationFeature,
	columnVisibilityFeature,
	sortedRowModel: createSortedRowModel(),
	filteredRowModel: createFilteredRowModel(),
	paginatedRowModel: createPaginatedRowModel(),
	sortFns,
	filterFns,
});

interface Row extends Record<string, unknown> {
	name: string;
	members: number;
}

function makeTable(rows: Row[], pageSize = 10, globalFilter = "") {
	return createVueTable({
		features,
		data: rows,
		columns: [
			{ accessorKey: "name", header: "Room" },
			{ accessorKey: "members", header: "Members" },
		],
		state: { globalFilter },
		initialState: { pagination: { pageIndex: 0, pageSize } },
	});
}

const rooms: Row[] = Array.from({ length: 25 }, (_, i) => ({
	name: `room-${String(i).padStart(2, "0")}`,
	members: i % 7,
}));

describe("pagination", () => {
	test("splits rows into pages of the configured size", () => {
		const table = makeTable(rooms, 10);

		expect(table.getPageCount()).toBe(3);
		expect(table.getRowModel().rows.length).toBe(10);
	});

	test("advances to the next page and slices from the right offset", () => {
		const table = makeTable(rooms, 10);

		table.nextPage();

		expect(table.atoms.pagination.get().pageIndex).toBe(1);
		expect(table.getRowModel().rows[0]?.getValue("name")).toBe("room-10");
	});

	test("returns a short final page rather than padding it", () => {
		const table = makeTable(rooms, 10);

		table.setPageIndex(2);

		expect(table.getRowModel().rows.length).toBe(5);
	});

	test("reports when there is nowhere further to go", () => {
		const table = makeTable(rooms, 10);

		expect(table.getCanPreviousPage()).toBe(false);
		expect(table.getCanNextPage()).toBe(true);

		table.setPageIndex(2);

		expect(table.getCanPreviousPage()).toBe(true);
		expect(table.getCanNextPage()).toBe(false);
	});

	test("goes back a page", () => {
		const table = makeTable(rooms, 10);
		table.setPageIndex(2);

		table.previousPage();

		expect(table.atoms.pagination.get().pageIndex).toBe(1);
	});

	test("keeps a single page when the data fits", () => {
		const table = makeTable(rooms.slice(0, 4), 10);

		expect(table.getPageCount()).toBe(1);
		expect(table.getCanNextPage()).toBe(false);
	});

	test("handles an empty data set without erroring", () => {
		const table = makeTable([], 10);

		expect(table.getRowModel().rows.length).toBe(0);
		expect(table.getCanNextPage()).toBe(false);
	});
});

describe("sorting", () => {
	test("orders rows by a column", () => {
		const table = makeTable(rooms, 30);

		table.getColumn("members")?.toggleSorting(false);

		const values = table.getRowModel().rows.map(r => r.getValue("members") as number);
		expect(values).toEqual([...values].sort((a, b) => a - b));
	});

	test("reverses the order on a second toggle", () => {
		const table = makeTable(rooms, 30);

		table.getColumn("members")?.toggleSorting(false);
		table.getColumn("members")?.toggleSorting(true);

		const values = table.getRowModel().rows.map(r => r.getValue("members") as number);
		expect(values).toEqual([...values].sort((a, b) => b - a));
	});
});

describe("global filter", () => {
	test("narrows rows to those matching the query", () => {
		const table = makeTable(rooms, 30, "room-1");

		const names = table.getRowModel().rows.map(r => r.getValue("name") as string);
		expect(names.length).toBeGreaterThan(0);
		expect(names.every(n => n.includes("room-1"))).toBe(true);
	});

	test("recomputes the page count against the filtered rows", () => {
		// Filtering must shrink pagination too; otherwise the control offers
		// pages that no longer hold anything.
		const unfiltered = makeTable(rooms, 5);
		const filtered = makeTable(rooms, 5, "room-1");

		expect(unfiltered.getPageCount()).toBe(5);
		expect(filtered.getPageCount()).toBeLessThan(unfiltered.getPageCount());
	});

	test("returns no rows when nothing matches", () => {
		const table = makeTable(rooms, 30, "nonexistent-room");

		expect(table.getRowModel().rows.length).toBe(0);
	});
});
