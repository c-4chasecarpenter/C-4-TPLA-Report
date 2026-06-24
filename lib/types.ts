// Shared types for the analysis engine and slides payload.

export type Row = Record<string, any>;

export interface AggregatedRow {
  source: string;
  good: number;   // non-bad, non-dup leads; includes sold
  sold: number;
  bad: number;
  dup: number;
  gross: number;  // total gross profit summed from the export's gross column(s)
  month?: string; // 'YYYY-MM' when inferrable from filename
}

// Which column index feeds each canonical field in an aggregated report.
// -1 = not present. Surfaced to the UI so the user can see/override the mapping.
export interface AggColMap {
  sourceIdx: number;
  leadsIdx: number;
  goodIdx: number;
  badIdx: number;
  dupIdx: number;
  soldIdx: number;
  grossIdx: number[];
  pvr: boolean;
}

// Everything needed to re-parse an aggregated file when the user overrides the
// detected mapping (the raw grid is retained so re-parsing is local + instant).
export interface AggRemap {
  grid: string[][];
  headerIdx: number;
  labels: string[]; // display label per column ("Band · Header")
  map: AggColMap;
}

export type ParseResult =
  | { kind: 'desklog'; rows: Row[]; fileName: string }
  | { kind: 'aggregated'; rows: AggregatedRow[]; fileName: string; remap?: AggRemap };

export interface Threshold { good: number; bad: number; }
export interface Thresholds { cpl: Threshold; close: Threshold; cpa: Threshold; }

export interface SourceEntry { name: string; monthly: number; }

export interface MonthBucket { leads: number; good: number; sold: number; gross: number; }

export interface PlatformAgg {
  name: string;
  monthly: number;
  leads: number;
  good: number;
  sold: number;
  gross: number;
  bm: Record<string, MonthBucket>;
}

export interface ReportData {
  data: PlatformAgg[];
  comb: { leads: number; good: number; sold: number; gross: number; bm: Record<string, MonthBucket> };
  combMonthlySpend: number;
  combPeriodSpend: number;
  months: number;
  mkeys: string[];
  mlabels: string[];
  t: Thresholds;
  meta: { deal: string; timeframe: string; description: string };
  unmatchedLeads: number;
  unmatchedSources: { source: string; leads: number; sold: number; gross: number }[];
  unknownStatuses: string[];
  hasGross: boolean;  // any gross detected anywhere in the data
}

export interface ColumnMap {
  source: string | null;
  status: string | null;
  created: string | null;
}

// Rating class used for color coding. '' = no rating.
export type RatingClass = '' | 'good' | 'ok' | 'bad';

// ---- Slides payload (what the client sends to the API to render a deck) ----
export interface Cell { text: string; cls?: RatingClass; }
export interface TableBlock { header: string[]; rows: { cells: Cell[] }[]; soldCols?: number[]; }
export interface Tile { label: string; value: string; cls?: RatingClass; soldOnly?: boolean; }
export interface PlatformSlide {
  name: string;
  spendLabel: string;
  tiles: Tile[];
  verdict: { tier: RatingClass; text: string } | null;
  projection: TableBlock | null;
  monthly: TableBlock;
}
export interface SlidesPayload {
  deal: string;
  timeframe: string;
  description: string;
  months: number;
  generatedDate: string;
  showSold: boolean;
  thresholds: Thresholds;
  legend: TableBlock;
  kpis: Tile[];
  comparison: TableBlock;
  combinedMonthly: TableBlock;
  platforms: PlatformSlide[];
}
