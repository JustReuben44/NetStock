// PostgREST .or() filter strings treat commas, parentheses and quotes as
// syntax, so raw user input can break (or alter) the query. Strip them,
// along with LIKE wildcards, before interpolating a search term.
export function sanitizeSearch(input: string): string {
  return input.replace(/[,()"'\\%_]/g, " ").trim();
}
