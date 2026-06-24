// Gross-profit detection for CRM exports.
//
// Gross arrives under many column names — frontgross, backgross, sourceFIgross,
// sourcetotalgross, "Total Gross", etc. Rule: if any "total" gross column is
// present, use those (they already sum the components); otherwise sum every
// gross component column. Averages / percentages / per-deal columns are ignored
// so we never sum a rate as if it were dollars.

const norm = (h: string) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');

// Parse a money-ish cell from any CRM export. Handles the real-world mess:
//   "$1,234.50" → 1234.5      "(500)" / "-$500" / "$-500" → -500
//   "1,491" (comma-thousands) → 1491    "6.22E+03" (Excel sci-notation) → 6220
//   "########" (Excel column-overflow, value unrecoverable) → 0
//   "3.79%" → 3.79            "-" / "" → 0
export function parseMoney(v: any): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v == null) return 0;
  const raw = String(v).trim();
  if (!raw) return 0;
  if (/^#+$/.test(raw)) return 0; // Excel "########" overflow — value is lost
  // Negative if wrapped in parens, or a minus sign survives once symbols/spaces go.
  const signProbe = raw.replace(/[$£€,%\s]/g, '');
  const neg = /^\(.*\)$/.test(raw) || signProbe.startsWith('-');
  // Strip currency/grouping/percent/parens/spaces but KEEP digits, dot, e, sign.
  let s = raw.replace(/[(),$£€%\s]/g, '').replace(/^[+-]/, '');
  let n = Number(s); // Number() understands "6.22E+03"
  if (!isFinite(n)) {
    n = parseFloat(s.replace(/[^0-9.]/g, ''));
    if (!isFinite(n)) return 0;
  }
  if (n === 0) return 0; // avoid "-0" from "-", "($0)", etc.
  return neg ? -Math.abs(n) : n;
}

// Integer count from a possibly comma-formatted cell: "1,491" → 1491.
export function parseCount(v: any): number {
  return Math.round(parseMoney(v));
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
