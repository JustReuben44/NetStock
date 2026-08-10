// PostgREST .or() filter strings treat commas, parentheses and quotes as
// syntax, so raw user input can break (or alter) the query. Strip them,
// along with LIKE wildcards, before interpolating a search term.
export function sanitizeSearch(input: string): string {
  return input.replace(/[,()"'\\%_]/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Client-side item search
//
// The stock page loads every item up front, so matching happens in the browser
// against a precomputed index. Each row becomes a SearchDoc once; scoring then
// runs over the normalized fields on every keystroke.
// ---------------------------------------------------------------------------

/** Lowercase, strip diacritics, reduce punctuation to spaces, collapse runs. */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenize(query: string): string[] {
  const normalized = normalizeText(query);
  return normalized ? normalized.split(" ") : [];
}

export type SearchDoc = {
  row: any;
  itemId: string;
  /** Normalized haystacks. */
  name: string;
  nameWords: string[];
  type: string;
  group: string;
  description: string;
  haloId: string;
  locations: string;
  /** Raw values for filtering and display. */
  display: {
    itemName: string;
    itemType: string;
    productGroup: string;
    quantity: number | null;
    locationIds: string[];
  };
};

/** Supabase returns to-one embeds as an object, to-many as an array. */
function firstOf<T>(embed: T | T[] | null | undefined): T | null {
  if (!embed) return null;
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}

export function buildSearchDoc(row: any): SearchDoc {
  const equipment = firstOf<any>(row.equipment);
  const tool = firstOf<any>(row.tool);
  const links: any[] = Array.isArray(row.item_location) ? row.item_location : [];

  const locationIds = links.map((l) => l.location_id).filter(Boolean);
  const locationParts = links.flatMap((l) => [
    l.location_id,
    l.location?.rack,
    l.location?.shelf,
    l.location?.box,
    l.location?.box_type,
  ]);

  const name = normalizeText(row.item_name);

  return {
    row,
    itemId: normalizeText(row.item_id),
    name,
    nameWords: name ? name.split(" ") : [],
    type: normalizeText(row.item_type),
    group: normalizeText(row.product_group),
    description: normalizeText(row.description),
    haloId: normalizeText(equipment?.halo_id != null ? String(equipment.halo_id) : ""),
    locations: normalizeText(locationParts.filter(Boolean).join(" ")),
    display: {
      itemName: row.item_name ?? "",
      itemType: row.item_type ?? "",
      productGroup: row.product_group ?? "",
      quantity: tool?.quantity ?? null,
      locationIds,
    },
  };
}

const SCORE_EXACT_NAME = 1000;
const SCORE_NAME_PREFIX = 500;
const SCORE_WORD_PREFIX = 100;
const SCORE_ID = 80;
const SCORE_NAME_SUBSTRING = 60;
const SCORE_META = 40;
const SCORE_LOCATION = 30;
const SCORE_DESCRIPTION = 15;
const SCORE_FUZZY = 5;

/**
 * Levenshtein distance with an early exit — returns true when a and b are
 * within `max` edits. Bailing out on the row minimum keeps this cheap enough
 * to run per token against every item name.
 */
export function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const curr = new Array<number>(b.length + 1);
    curr[0] = i;
    let rowMin = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }

    if (rowMin > max) return false;
    prev = curr;
  }

  return prev[b.length] <= max;
}

/** Best score this token can earn against any field, or 0 for no match. */
function scoreToken(doc: SearchDoc, token: string): number {
  let best = 0;
  const bump = (score: number) => {
    if (score > best) best = score;
  };

  if (doc.nameWords.some((word) => word.startsWith(token))) bump(SCORE_WORD_PREFIX);
  else if (doc.name.includes(token)) bump(SCORE_NAME_SUBSTRING);

  if (doc.itemId === token || doc.haloId === token) bump(SCORE_ID);
  if (doc.group.includes(token) || doc.type.includes(token)) bump(SCORE_META);
  if (doc.locations.includes(token)) bump(SCORE_LOCATION);
  if (doc.description.includes(token)) bump(SCORE_DESCRIPTION);

  // Typo fallback, only when nothing matched outright. Short tokens are left
  // alone (too many false hits) and only names are compared — fuzzing against
  // free-text descriptions is mostly noise.
  if (best === 0 && token.length >= 4) {
    const maxEdits = token.length >= 7 ? 2 : 1;
    if (doc.nameWords.some((word) => editDistanceWithin(word, token, maxEdits))) {
      bump(SCORE_FUZZY);
    }
  }

  return best;
}

/** Total score for a doc, or null when any token fails to match (AND). */
export function scoreDoc(doc: SearchDoc, tokens: string[], normalizedQuery: string): number | null {
  let total = 0;

  for (const token of tokens) {
    const score = scoreToken(doc, token);
    if (score === 0) return null;
    total += score;
  }

  if (doc.name === normalizedQuery) total += SCORE_EXACT_NAME;
  else if (doc.name.startsWith(normalizedQuery)) total += SCORE_NAME_PREFIX;

  return total;
}

export type SearchFilters = {
  query?: string;
  location?: string;
  itemType?: string;
  productGroup?: string;
};

export type SortMode = "relevance" | "asc" | "desc";

export function searchItems(
  docs: SearchDoc[],
  filters: SearchFilters,
  sort: SortMode = "relevance",
): SearchDoc[] {
  const query = normalizeText(filters.query);
  const tokens = query ? query.split(" ") : [];
  const location = normalizeText(filters.location);

  const matches: { doc: SearchDoc; score: number }[] = [];

  for (const doc of docs) {
    if (filters.itemType && doc.display.itemType !== filters.itemType) continue;
    if (filters.productGroup && doc.display.productGroup !== filters.productGroup) continue;
    if (location && !doc.locations.includes(location)) continue;

    let score = 0;
    if (tokens.length) {
      const scored = scoreDoc(doc, tokens, query);
      if (scored === null) continue;
      score = scored;
    }

    matches.push({ doc, score });
  }

  const byName = (a: SearchDoc, b: SearchDoc) =>
    a.display.itemName.localeCompare(b.display.itemName, undefined, { sensitivity: "base" });

  if (sort === "relevance" && tokens.length) {
    // Ties break alphabetically so ordering stays stable and predictable.
    matches.sort((a, b) => b.score - a.score || byName(a.doc, b.doc));
  } else {
    matches.sort((a, b) => (sort === "desc" ? byName(b.doc, a.doc) : byName(a.doc, b.doc)));
  }

  return matches.map((m) => m.doc);
}
