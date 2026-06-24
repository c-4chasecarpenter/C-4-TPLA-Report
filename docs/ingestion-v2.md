# Ingestion v2 — versatile CRM file parsing

**Branch:** `feature/ingestion-v2` (do NOT merge to `main`/production until approved)
**Started:** 2026-06-24
**Goal:** Make data ingestion read *any* third-party-lead CRM export (CSV/Excel) — auto-detect structure, map columns into the canonical model, and stress-test against a corpus of real files. Production app stays untouched until the preview is verified.

How to test: run tests with `npm test`. (Preview URLs: see Vercel note below.)

> ⚠️ **Vercel wiring (found 2026-06-24):** local git `origin` = `c-4chasecarpenter/C-4-TPLA-Report`, but the Vercel "tpla" project's only deployment came from repo `tpla-report` on branch `master`. So pushing this branch does **not** auto-build a preview. Production is therefore safe from our pushes — but before Phase 1 (first visual change) we must reconnect the Vercel project's Git integration to `C-4-TPLA-Report` (or deploy previews explicitly via `vercel` CLI). Build sanity is being verified locally with `npx next build` in the meantime.

---

## Status

| Phase | What | State |
|---|---|---|
| 0 | Vitest harness + fixture corpus + golden-number baseline | ✅ done (commit 5d0b8d8) |
| 1 | Cleaning + mapping core (real-header detect, multi-sheet xlsx, hardened number parsing, headerless desk-log) | ⬜ not started |
| 2 | Role-scoring detector + preview/override UI (replaces hardcoded signatures) | ⬜ not started |
| 3 | Matching polish (source aliases, reclassify-unknown-status, per-file error isolation) | ⬜ not started |

---

## The 4 CRM report families (all real samples)

1. **DealerSocket "Group" / "Opportunities"** (GA·KAL, Classic Chevy OKC) — 2-row merged super-header. source=`Group`/`Source Description Group`; leads=`Leads`/`Total Opportunities`; sold=`Units`/`Total Sold` (NOT the appointment "Sold" col); gross=`Total` sub-col, or for Opportunities `Total Gross PVR` = PER-DEAL AVG (real gross = PVR × sold). Skip child sub-rows (`Internet`) + `Total` row.
2. **DealerSocket "Tracking Codes"** (George Chevy) — ~8-row title/preamble block, empty leading col, multi-line header cells, true source in `Marketing` col (col 2), grand-total rows (`Grand Totals:`, `Rows: 88`).
3. **Cox/VinSolutions FLAT** (Diepholz, Larson, Courtesy) — MOST COMMON. Single header (Courtesy has a leading blank row + `TOTAL` row). source=`Lead Source Group`/`Lead Source`; leads=`Total Leads`/`Good Leads`; sold=`Sold from Leads`; gross=`Total Gross`. Diepholz has a `Lead Type` 2nd dimension. `$` appears on COUNT columns → only read gross from RESOLVED gross cols. `&Amp;` entities in names.
4. **Raw desk-log** (Griffin CDJR) — the ORIGINAL supported format, row-per-lead. Header `Lead Source,Lead Type,Lead Status Type,Year,Make,Model,Lead Origination Date`. Status Lost/Bad→bad, Sold→sold, Active→good. Date `07/01/2025 18:44 tt` (junk suffix dropped). Already Internet-only, split New/Used×month. **BREAKS when header row missing** (Griffin July-New) → must detect headerless desk-log by value-shape.

## Number-parsing traps (parseMoney must handle — all silently corrupt today)
comma-thousands `"1,491"`→1 · sci-notation `6.22E+03`→6.22 · `"$-535"`→+535 (minus after $) · `"########"` Excel overflow→0 (value unrecoverable — FLAG, don't zero) · `"-"` null · `"3.79%"`.

## Gross bug today
`Total Front Gross`+`Total Back Gross`+`Total Gross` all contain "total" → resolver sums all 3 = 2× real gross. Grand total already = front+back.

---

## Decisions (locked)

- **Multi-sheet .xlsx** → user picks + maps each sheet to dealer + month.
- **Lead Type** → count **Internet only** (exclude Walk-in/Service/Wholesale).
- **`sold`** = "Sold from Leads" (attribute sales to lead source, not all store sales) when both that and "Sold in Timeframe" exist.
- **Production safety** → branch + preview; no merge to main until approved.

## Canonical target fields (map every file into these)
`source` (req), `leads` (req), `sold` (req), `gross`, `bad` (opt), `duplicate` (opt), `good` (DERIVED: explicit `Good Leads` else `leads − bad − duplicate`; headline rating number), `month` (date col / sheet name / filename).
Desk-log-only inputs: `status`, `lead type`. NOT from files: monthly spend, dealer name, timeframe, thresholds (UI-entered).

## Output report tables
- **T1 Third Parties:** Platform · Spend (Monthly) · Spend (Period) · Good leads · Cost/good lead · Sold · Cost/sold · Closing rate · Gross · Return/Profit. *(fed by ingestion)*
- **T2 C-4 Performance:** MANUAL entry, already built — leave as-is, NOT in ingestion scope.
- **T3 C-4 vs 3rd parties:** Channel · Spend/mo · Spend (period) · Leads · Cost/lead · Sold · Cost/sold · Closing · Gross · Return/Profit. *(3rd-party "Leads" = good leads, apples-to-apples)*
- Return/Profit = Gross − Period Spend (confirm; maybe add ROI multiple ×).
