// Gross-profit detection for CRM exports.
//
// Gross arrives under many column names — frontgross, backgross, sourceFIgross,
// sourcetotalgross, "Total Gross", etc. Rule: if any "total" gross column is
// present, use those (they already sum the components); otherwise sum every
// gross component column. Averages / percentages / per-deal columns are ignored
// so we never sum a rate as if it were dollars.

const norm = (h: string) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');

// Parse a money-ish cell: "$1,234.50", "(500)" → -500, "" → 0.
export function parseMoney(v: any): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v == null) return 0;
  const raw = String(v).trim();
  if (!raw) return 0;
  const neg = /^\(.*\)$/.test(raw) || raw.startsWith('-');
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  return neg ? -Math.abs(n) : n;
}

function isGrossHeader(n: string): boolean {
  if (!n.includes('gross')) return false;
  // Skip rates/averages/counts that merely contain "gross".
  return !/(avg|average|percent|pct|perdeal|perunit|perlead|count|qty|number|lead)/.test(n);
}

// From original (un-normalized) headers → the header strings to sum for gross.
export function resolveGrossHeaders(headers: string[]): string[] {
  const cand = headers.filter((h) => isGrossHeader(norm(h)));
  if (!cand.length) return [];
  const totals = cand.filter((h) => norm(h).includes('total'));
  return totals.length ? totals : cand;
}

// From already-normalized headers → the column indices to sum for gross.
export function resolveGrossIdx(normHeaders: string[]): number[] {
  const cand = normHeaders.map((n, i) => ({ n, i })).filter((x) => isGrossHeader(x.n));
  if (!cand.length) return [];
  const totals = cand.filter((x) => x.n.includes('total'));
  return (totals.length ? totals : cand).map((x) => x.i);
}

// Sum the resolved gross columns for one row.
export function rowGross(row: Record<string, any>, grossHeaders: string[]): number {
  let g = 0;
  for (const h of grossHeaders) g += parseMoney(row[h]);
  return g;
}
