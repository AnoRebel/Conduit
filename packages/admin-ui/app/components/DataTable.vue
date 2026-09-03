<script setup lang="ts" generic="TData extends RowData">
import {
	columnFilteringFeature,
	columnVisibilityFeature,
	createFilteredRowModel,
	createPaginatedRowModel,
	createSortedRowModel,
	FlexRender,
	filterFns,
	globalFilteringFeature,
	type RowData,
	rowPaginationFeature,
	rowSortingFeature,
	sortFns,
	tableFeatures,
	useTable,
} from "@tanstack/vue-table";
import { ArrowUpDown } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationFirst,
	PaginationItem,
	PaginationLast,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { DataTableColumns } from "~/types/table";

/**
 * A sortable, filterable, paginated table.
 *
 * Sorting, filtering and pagination live in TanStack Table rather than in each
 * page, so every table in this dashboard behaves identically instead of each
 * re-implementing the parts it happens to need.
 *
 * In v9 the feature modules, row models, and comparator registries are all
 * declared together on the features object; nothing is bundled by default, so
 * the bundle carries only the behaviour actually used.
 */
const features = tableFeatures({
	rowSortingFeature,
	// The global filter builds on per-column filtering, so both are registered.
	columnFilteringFeature,
	globalFilteringFeature,
	rowPaginationFeature,
	// getVisibleCells() is part of column visibility, which rows need to render.
	columnVisibilityFeature,
	sortedRowModel: createSortedRowModel(),
	filteredRowModel: createFilteredRowModel(),
	paginatedRowModel: createPaginatedRowModel(),
	sortFns,
	filterFns,
});

const props = withDefaults(
	defineProps<{
		data: TData[];
		/** Column definitions built for this table's feature set. */
		columns: DataTableColumns<TData>;
		/** Substring filter applied across all columns. */
		globalFilter?: string;
		/** Rows per page (default: 10). */
		pageSize?: number;
		/** Message shown when there are no rows. */
		emptyMessage?: string;
		/** Noun used in the "showing N of M" summary. */
		itemLabel?: string;
		/** Plural form of {@link itemLabel}. */
		itemLabelPlural?: string;
	}>(),
	{
		globalFilter: "",
		pageSize: 10,
		emptyMessage: "No results.",
		itemLabel: "row",
		itemLabelPlural: "rows",
	}
);

const table = useTable({
	features,
	get data() {
		return props.data;
	},
	get columns() {
		return props.columns;
	},
	state: {
		get globalFilter() {
			return props.globalFilter;
		},
	},
	initialState: { pagination: { pageIndex: 0, pageSize: props.pageSize } },
});

/**
 * Pagination state.
 *
 * `getState()` was removed in v9; the Vue adapter exposes per-slice atoms, and
 * reading through one keeps this reactive to page changes.
 */
const pagination = computed(
	() => table.atoms.pagination.get() ?? { pageIndex: 0, pageSize: props.pageSize }
);

/** Rows after filtering, which is what the page controls are sized against. */
const filteredCount = computed(() => table.getFilteredRowModel().rows.length);

/**
 * Current page as a 1-based number.
 *
 * The pagination control is 1-based while the table is 0-based, so the
 * conversion lives here rather than being repeated at each call site.
 */
const currentPage = computed({
	get: () => pagination.value.pageIndex + 1,
	set: (page: number) => table.setPageIndex(page - 1),
});

/** First and last row numbers on the current page, for the summary line. */
const rangeStart = computed(() =>
	filteredCount.value === 0 ? 0 : pagination.value.pageIndex * pagination.value.pageSize + 1
);
const rangeEnd = computed(() =>
	Math.min((pagination.value.pageIndex + 1) * pagination.value.pageSize, filteredCount.value)
);
</script>

<template>
	<div class="space-y-3">
		<div class="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
						<TableHead v-for="header in headerGroup.headers" :key="header.id">
							<Button
								v-if="header.column.getCanSort()"
								variant="ghost"
								size="sm"
								class="-ml-3 h-8"
								@click="header.column.toggleSorting(header.column.getIsSorted() === 'asc')"
							>
								<FlexRender
									:render="header.column.columnDef.header"
									:props="header.getContext()"
								/>
								<ArrowUpDown class="ml-1 h-3 w-3" />
							</Button>
							<FlexRender
								v-else-if="!header.isPlaceholder"
								:render="header.column.columnDef.header"
								:props="header.getContext()"
							/>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<template v-if="table.getRowModel().rows.length">
						<!--
							A `row` slot lets a page keep its own per-row markup — context
							menus, tooltips — while still getting real sorting, filtering
							and pagination from the table engine. Without it those pages
							would have to express that markup through render functions,
							which reads far worse for no gain.
						-->
						<template v-for="(row, index) in table.getRowModel().rows" :key="row.id">
							<slot name="row" :row="row.original" :index="index">
								<TableRow data-testid="data-table-row">
									<TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
										<FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
									</TableCell>
								</TableRow>
							</slot>
						</template>
					</template>
					<TableRow v-else>
						<TableCell
							:colspan="columns.length"
							class="h-24 text-center text-muted-foreground"
						>
							{{ emptyMessage }}
						</TableCell>
					</TableRow>
				</TableBody>
			</Table>
		</div>

		<div
			v-if="table.getPageCount() > 1"
			class="flex flex-col sm:flex-row items-center justify-between gap-3"
			data-testid="data-table-pagination"
		>
			<p class="text-sm text-muted-foreground">
				Showing {{ rangeStart }} to {{ rangeEnd }} of {{ filteredCount }}
				{{ filteredCount === 1 ? itemLabel : itemLabelPlural }}
			</p>
			<Pagination
				v-model:page="currentPage"
				:total="filteredCount"
				:items-per-page="pagination.pageSize"
				:sibling-count="1"
				show-edges
			>
				<PaginationContent v-slot="{ items }">
					<PaginationFirst data-testid="data-table-first" />
					<PaginationPrevious data-testid="data-table-prev" />
					<template v-for="(item, index) in items">
						<PaginationItem
							v-if="item.type === 'page'"
							:key="index"
							:value="item.value"
							:is-active="item.value === currentPage"
						>
							{{ item.value }}
						</PaginationItem>
						<PaginationEllipsis v-else :key="`ellipsis-${index}`" :index="index" />
					</template>
					<PaginationNext data-testid="data-table-next" />
					<PaginationLast data-testid="data-table-last" />
				</PaginationContent>
			</Pagination>
		</div>
	</div>
</template>
