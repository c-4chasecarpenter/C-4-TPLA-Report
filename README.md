# Third Party Lead Source Report

Interactive web app that analyzes a dealership CRM export and rates each third
party lead platform on cost per good lead, cost per vehicle sold, and closing
rate. Signed-in C-4 users can generate a client-ready Google Slides deck with
one click.

This is the Next.js rebuild of the original single-file HTML tool, with two
things the HTML version could not do: Google sign-in and direct Slides API deck
generation (no Apps Script).

## What works right now

- Upload a CSV or Excel CRM export, auto-detects columns and the month range.
- Fuzzy name matching collapses source variants (every "Autotrader..." into one).
- Good-lead filter (drops anything the CRM marked Bad).
- Per-platform tabs, overview comparison, monthly breakdowns, charts.
- Editable performance key (Good / Medium / Bad) driving color coding everywhere.
- Interactive closing-rate projection slider.
- Show / hide sold data toggle for lead-only client views.
- **Generate presentation**: builds a real Google Slides deck in your Drive.

The whole thing typechecks clean (`npx tsc --noEmit`) and builds
(`npm run build`).

## Getting started

```
npm install
cp .env.local.example .env.local   # then fill in values
npm run dev
```

Google sign-in and slide generation need OAuth credentials. Follow
**SETUP_GOOGLE_OAUTH.md** first. The report builder itself (everything except
the Generate button) works without any credentials.

## Project structure

```
app/
  page.tsx                      main app (setup -> report)
  providers.tsx                 NextAuth session provider
  api/auth/[...nextauth]/       Google sign-in handler
  api/generate-slides/          server route that calls the Slides API
components/
  SetupForm.tsx                 4-step intake
  GeneratePresentationButton.tsx  sign-in gate + deck request
  report/
    Report.tsx                  tabbed report shell
    parts.tsx                   tiles, legend, monthly table, comparison, chart
    ProjectionSlider.tsx        interactive closing-rate what-if
lib/
  types.ts                      shared types
  analysis.ts                   column detection, matching, monthly aggregation
  format.ts                     formatting + rating-class logic
  parse.ts                      CSV / Excel parsing (client)
  slidesPayload.ts              ReportData -> slide-ready payload
  slidesBuilder.ts              Slides API batchUpdate deck builder (server)
  auth.ts                       NextAuth config, domain lock, scopes
styles/globals.css              ported design system
```

The analysis logic in `lib/` is framework-agnostic and was validated to produce
identical numbers to the original tool (CarGurus 263 leads / 144 good / 21 sold,
Autotrader 320 / 163 / 22, etc.).

## Continuing in Claude Code

Open this folder in Claude Code and you can keep building. Good next steps:

- **Save and reload reports** (Vercel Postgres or KV) so dealers have history.
- **Branded deck themes** per dealership in `lib/slidesBuilder.ts`.
- **Cost per all leads** alongside cost per good lead, to match the raw CPL
  benchmark exactly (see the note from the benchmark discussion).
- **Lead-to-appointment** column once that data is available in the export.
- **Tighten the deck layout** in `slidesBuilder.ts` (positions are in points;
  it is laid out but not yet pixel-polished).

## Notes

- Slides generation uses the least-privilege `drive.file` scope, so the app can
  only touch files it creates.
- Sign-in is hard-locked to `c-4analytics.com` in `lib/auth.ts` (both the Google
  `hd` hint and a server-side `signIn` check).
- Deck respects the Show sold data toggle: lead-only state produces a lead-only
  deck.
