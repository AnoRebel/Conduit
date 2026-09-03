import type {
	ColumnDef,
	columnFilteringFeature,
	columnVisibilityFeature,
	globalFilteringFeature,
	RowData,
	rowPaginationFeature,
	rowSortingFeature,
	tableFeatures,
} from "@tanstack/vue-table";

/**
 * The feature set every dashboard table uses.
 *
 * v9 requires features to be registered explicitly, and a column definition's
 * type is parameterised by them. Declaring the set once here keeps every page's
 * columns aligned with what `DataTable` actually configures — a mismatch is a
 * type error rather than a runtime surprise.
 */
export type DashboardTableFeatures = ReturnType<
	typeof tableFeatures<{
		rowSortingFeature: typeof rowSortingFeature;
		columnFilteringFeature: typeof columnFilteringFeature;
		globalFilteringFeature: typeof globalFilteringFeature;
		rowPaginationFeature: typeof rowPaginationFeature;
		columnVisibilityFeature: typeof columnVisibilityFeature;
	}>
>;

/** Column definitions for a dashboard table over rows of `TData`. */
export type DataTableColumns<TData extends RowData> = ColumnDef<DashboardTableFeatures, TData>[];
