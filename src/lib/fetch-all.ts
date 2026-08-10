// PostgREST caps every response at db.max_rows (1000 by default) and gives no
// signal that it truncated. Page through .range() until a short page comes
// back so callers always see the whole table.
const DEFAULT_PAGE_SIZE = 1000;

type RangeQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
};

/**
 * Runs a Supabase select in pages and returns every row.
 *
 * `build` must return a *fresh* query each call — PostgREST builders are
 * single-use, so the same one cannot be awaited twice.
 *
 * Throws on error rather than returning a partial list; the caller decides
 * how to surface it.
 */
export async function fetchAllRows<T>(
  build: () => RangeQuery<T>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) return rows;

    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}
