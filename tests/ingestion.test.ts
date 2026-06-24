import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFile } from '@/lib/parse';
import { detectColumns, normalizeStatus } from '@/lib/analysis';
import type { AggregatedRow } from '@/lib/types';

// Build a real File from a fixture so we exercise the actual parseFile() path.
function loadFixture(rel: string): File {
  const path = resolve(__dirname, '..', 'fixtures', rel);
  const text = readFileSync(path, 'utf8');
  const name = rel.split('/').pop()!;
  return new File([text], name, { type: 'text/csv' });
}

const sum = (rows: AggregatedRow[], k: keyof AggregatedRow) =>
  rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

// ---------------------------------------------------------------------------
// Family 4 — raw desk-log (Griffin). This format WORKS today; real baseline.
// ---------------------------------------------------------------------------
describe('Family 4 — raw desk-log (Griffin Jul Used)', () => {
  it('parses as desklog and auto-detects source/status/date columns', async () => {
    const res = await parseFile(loadFixture('family4-desklog/griffin-jul-used.csv'));
    expect(res.kind).toBe('desklog');
    if (res.kind !== 'desklog') return;
    const cols = detectColumns(Object.keys(res.rows[0]));
    expect(cols.source).toBe('Lead Source');
    expect(cols.status).toBe('Lead Status Type');
    expect(cols.created).toBe('Lead Origination Date');
  });

  it('buckets statuses correctly: 7 Sold, 2 Active(good), Lost/Bad → bad', async () => {
    const res = await parseFile(loadFixture('family4-desklog/griffin-jul-used.csv'));
    if (res.kind !== 'desklog') throw new Error('expected desklog');
    const buckets: Record<string, number> = {};
    for (const r of res.rows) {
      const b = normalizeStatus(String(r['Lead Status Type'] ?? ''));
      buckets[b] = (buckets[b] ?? 0) + 1;
    }
    expect(buckets.sold).toBe(7);
    expect(buckets.good).toBe(2); // two "Active" rows
  });
});

// ---------------------------------------------------------------------------
// Family 4 edge case — headerless desk-log (Griffin Jul New, header row missing).
// TARGET: should still be recognized as a desk-log. Broken today → it.fails.
// ---------------------------------------------------------------------------
describe('Family 4 edge — headerless desk-log (Griffin Jul New)', () => {
  it('recognizes a headerless desk-log and finds 4 Sold', async () => {
    const res = await parseFile(loadFixture('family4-desklog/griffin-jul-new-NOHEADER.csv'));
    expect(res.kind).toBe('desklog');
    if (res.kind !== 'desklog') throw new Error('not desklog');
    // Synthesized columns: col0 = source, col2 = status (once headerless handling lands)
    const statusKey = Object.keys(res.rows[0])[2];
    const sold = res.rows.filter(
      (r) => normalizeStatus(String(r[statusKey] ?? '')) === 'sold',
    ).length;
    expect(sold).toBe(4); // 4 "Sold" rows in this file
  });
});

// ---------------------------------------------------------------------------
// Family 1 — DealerSocket "Group" (KAL Apr 2026). Broken today → it.fails.
// Golden truth = the file's own Total row: Leads 760, Units 74, Total 154,831.57.
// Enforces child-subrow skipping (the duplicate "Internet" rows must NOT add).
// ---------------------------------------------------------------------------
describe('Family 1 — DealerSocket Group (KAL Apr 2026)', () => {
  it('aggregated totals match the Total row (leads 760 / sold 74 / gross 154831.57)', async () => {
    const res = await parseFile(loadFixture('family1-dealersocket-group/kal-apr2026.csv'));
    expect(res.kind).toBe('aggregated');
    if (res.kind !== 'aggregated') throw new Error('not aggregated');
    expect(sum(res.rows, 'good')).toBe(760);
    expect(sum(res.rows, 'sold')).toBe(74);
    expect(sum(res.rows, 'gross')).toBeCloseTo(154831.57, 2);
  });
});

// ---------------------------------------------------------------------------
// Family 3 — Cox/VinSolutions flat (Courtesy Feb 2026). Broken today → it.fails.
// Golden truth = the TOTAL row: Good Leads 251, Sold from Leads 20, Total Gross 38,137.15.
// ---------------------------------------------------------------------------
describe('Family 3 — Cox/VinSolutions flat (Courtesy Feb 2026)', () => {
  it('aggregated totals match the TOTAL row (good 251 / sold 20 / gross 38137.15)', async () => {
    const res = await parseFile(loadFixture('family3-cox-flat/courtesy-feb2026.csv'));
    expect(res.kind).toBe('aggregated');
    if (res.kind !== 'aggregated') throw new Error('not aggregated');
    expect(sum(res.rows, 'good')).toBe(251);
    expect(sum(res.rows, 'sold')).toBe(20);
    expect(sum(res.rows, 'gross')).toBeCloseTo(38137.15, 2);
  });
});
