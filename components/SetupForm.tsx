'use client';
import { useMemo, useState } from 'react';
import { parseFile } from '@/lib/parse';
import { analyze, detectColumns, autoDetectMonths, DEFAULT_THRESHOLDS } from '@/lib/analysis';
import { ReportData, SourceEntry, Thresholds, ColumnMap, ParseResult } from '@/lib/types';
import { fmt$ } from '@/lib/format';

const SEED = ['CarGurus', 'Autotrader', 'Cars.com', 'Carfax'];

export default function SetupForm({ onGenerate }: { onGenerate: (r: ReportData) => void }) {
  const [deal, setDeal] = useState('');
  const [timeframe, setTimeframe] = useState('');
  const [description, setDescription] = useState('');
  const [sources, setSources] = useState<SourceEntry[]>(SEED.map((name) => ({ name, monthly: 0 })));
  const [thr, setThr] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [files, setFiles] = useState<ParseResult[]>([]);
  const [months, setMonths] = useState<number>(1);
  const [detected, setDetected] = useState<number | null>(null);
  const [err, setErr] = useState('');

  // column mapping state (applies to desk log files)
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [colMap, setColMap] = useState<ColumnMap>({ source: null, status: null, created: null });
  const [showColMapping, setShowColMapping] = useState(false);

  const activeSources = useMemo(() => sources.filter((s) => s.name.trim()), [sources]);
  const hasDeskLogs = files.some((f) => f.kind === 'desklog');
  const colsReady = !hasDeskLogs || (colMap.source !== null && colMap.status !== null);
  const canRun = files.length > 0 && activeSources.length > 0 && colsReady;

  const totalRows = useMemo(() =>
    files.reduce((n, f) => n + (f.kind === 'desklog' ? f.rows.length : f.rows.length), 0),
    [files]
  );

  function setSrc(i: number, patch: Partial<SourceEntry>) {
    setSources((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function removeFile(idx: number) {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // Re-derive column mapping from remaining desk logs
      const firstDesk = next.find((f) => f.kind === 'desklog');
      if (firstDesk) {
        const headers = Object.keys(firstDesk.rows[0] || {});
        const cols = detectColumns(headers);
        setRawHeaders(headers);
        setColMap(cols);
        setShowColMapping(!cols.source || !cols.status);
      } else {
        setRawHeaders([]);
        setColMap({ source: null, status: null, created: null });
        setShowColMapping(false);
      }
      const m = autoDetectMonths(next, colMap.created);
      setDetected(m);
      setMonths(m || 1);
      return next;
    });
  }

  async function handleNewFiles(incoming: FileList) {
    setErr('');
    const results: ParseResult[] = [];
    for (const f of Array.from(incoming)) {
      // Skip duplicate filenames
      if (files.some((x) => x.fileName === f.name)) continue;
      try {
        results.push(await parseFile(f));
      } catch (e: any) {
        setErr(e.message || 'Could not read a file.');
        return;
      }
    }
    if (!results.length) return;

    setFiles((prev) => {
      const next = [...prev, ...results];

      // Column mapping: derive from first desk log in the combined set
      const firstDesk = next.find((f) => f.kind === 'desklog');
      if (firstDesk) {
        const headers = Object.keys(firstDesk.rows[0] || {});
        const cols = detectColumns(headers);
        setRawHeaders(headers);
        setColMap(cols);
        if (!cols.source || !cols.status) setShowColMapping(true);
      }

      // Month detection
      const firstDesk2 = next.find((f) => f.kind === 'desklog');
      const createdCol = firstDesk2
        ? detectColumns(Object.keys(firstDesk2.rows[0] || {})).created
        : null;
      const m = autoDetectMonths(next, createdCol);
      setDetected(m);
      setMonths(m || 1);

      return next;
    });
  }

  function run() {
    if (!files.length) return;
    const report = analyze(files, colMap, activeSources, months, thr, { deal, timeframe, description });
    onGenerate(report);
  }

  const dropZoneLabel = files.length
    ? `Add more files`
    : 'Drop files here or click to browse';
  const dropZoneSub = files.length
    ? 'Accepts CSV, Excel (.xlsx, .xls), or TSV'
    : 'CSV, Excel (.xlsx, .xls), or TSV · Multiple files supported';

  return (
    <>
      <div className="card">
        <div className="card-head"><span className="eyebrow">Report details</span><span className="step">Step 1 of 4</span></div>
        <div className="card-pad">
          <div className="grid grid-2">
            <div><label>Dealership name</label><input type="text" value={deal} onChange={(e) => setDeal(e.target.value)} placeholder="e.g. Burien Chevrolet" /></div>
            <div><label>Timeframe</label><input type="text" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="e.g. Jan to Jun 2026" /></div>
          </div>
          <div style={{ marginTop: 18 }}>
            <label>Description <span className="hint">optional context for the report header</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Six month review of third party lead spend ahead of contract renewals." />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><span className="eyebrow">Third party platforms</span><span className="step">Step 2 of 3</span></div>
        <div className="card-pad">
          <p className="auto-note" style={{ marginBottom: 16 }}>Add each third party platform and its <b>monthly</b> spend. Every messy source name variant gets matched to the right platform automatically.</p>
          <div className="src-head"><span>Platform name</span><span>Monthly spend</span><span /></div>
          {sources.map((s, i) => (
            <div className="src-row" key={i}>
              <input type="text" value={s.name} placeholder="e.g. CarGurus" onChange={(e) => setSrc(i, { name: e.target.value })} />
              <div className="money-wrap">
                <input type="number" value={s.monthly || ''} placeholder="0" min={0} onChange={(e) => setSrc(i, { monthly: parseFloat(e.target.value) || 0 })} />
                <span className="month-tag">/ mo</span>
              </div>
              <button className="rm" title="Remove" onClick={() => setSources((p) => p.filter((_, idx) => idx !== i))}>&times;</button>
            </div>
          ))}
          <button className="btn btn-add" onClick={() => setSources((p) => [...p, { name: '', monthly: 0 }])}>+ Add platform</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><span className="eyebrow">CRM export</span><span className="step">Step 3 of 3</span></div>
        <div className="card-pad">

          {/* Loaded file list */}
          {files.length > 0 && (
            <div className="file-list" style={{ marginBottom: 12 }}>
              {files.map((f, i) => (
                <div className="file-list-row" key={f.fileName}>
                  <span className="file-list-badge">{f.kind === 'aggregated' ? 'AGG' : 'LOG'}</span>
                  <span className="file-list-name">{f.fileName}</span>
                  <span className="file-list-count">
                    {f.kind === 'desklog'
                      ? `${f.rows.length.toLocaleString()} rows`
                      : `${f.rows.length} sources`}
                  </span>
                  <button className="rm" title="Remove" onClick={() => removeFile(i)}>&times;</button>
                </div>
              ))}
              {files.length > 1 && (
                <div className="file-list-total">
                  {files.length} files · {totalRows.toLocaleString()} total {files.every(f => f.kind === 'aggregated') ? 'source rows' : 'rows'}
                </div>
              )}
            </div>
          )}

          {/* Drop zone — always visible for adding more files */}
          <label className={'drop' + (files.length ? ' loaded' : '')}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) handleNewFiles(e.dataTransfer.files); }}>
            <input type="file" accept=".csv,.xlsx,.xls,.tsv" multiple hidden
              onChange={(e) => e.target.files?.length && handleNewFiles(e.target.files)} />
            <div className="big">{dropZoneLabel}</div>
            <div className="sub">{dropZoneSub}</div>
          </label>

          {/* Column mapper — only for desk log files */}
          {showColMapping && rawHeaders.length > 0 && (
            <ColumnMapper
              headers={rawHeaders}
              colMap={colMap}
              onChange={(m) => { setColMap(m); if (m.source && m.status) setShowColMapping(false); }}
            />
          )}

          {!showColMapping && hasDeskLogs && colMap.source && (
            <div className="col-detect-ok">
              <span className="detect-badge">&#10003; Source: <b>{colMap.source}</b></span>
              <span className="detect-badge">&#10003; Status: <b>{colMap.status}</b></span>
              {colMap.created && <span className="detect-badge">&#10003; Date: <b>{colMap.created}</b></span>}
              <button className="btn-relink" onClick={() => setShowColMapping(true)}>Change mapping</button>
            </div>
          )}

          <div className="footer-bar">
            <div className="auto-note">
              {detected ? <>Detected <b>{detected} month{detected > 1 ? 's' : ''}</b> of data. Adjust if needed: </> : 'Months in this data: '}
              {files.length > 0 && <input type="number" value={months} min={1} step={1} style={{ width: 54, padding: '4px 6px', marginLeft: 4 }} onChange={(e) => setMonths(parseInt(e.target.value) || 1)} />}
            </div>
            <button className="btn btn-primary" disabled={!canRun} onClick={run}>Generate report</button>
          </div>
          {err && <div className="err" style={{ display: 'block' }}>{err}</div>}
        </div>
      </div>
    </>
  );
}

// ---- Column mapper ----
function ColumnMapper({ headers, colMap, onChange }: {
  headers: string[];
  colMap: ColumnMap;
  onChange: (m: ColumnMap) => void;
}) {
  const opts = ['', ...headers];
  return (
    <div className="col-mapper">
      <div className="col-mapper-head">
        <span className="eyebrow" style={{ color: '#B7791F' }}>Column mapping needed</span>
        <p className="auto-note" style={{ marginTop: 4 }}>
          We couldn&apos;t auto-detect one or more required columns. Select which column in your file contains each piece of information.
        </p>
      </div>
      <div className="col-mapper-grid">
        <ColMapRow
          label="Lead source column"
          hint="Which platform or website sent this lead"
          required
          value={colMap.source || ''}
          options={opts}
          onChange={(v) => onChange({ ...colMap, source: v || null })}
        />
        <ColMapRow
          label="Lead status column"
          hint="Current disposition of the lead (Sold, Bad, Active, etc.)"
          required
          value={colMap.status || ''}
          options={opts}
          onChange={(v) => onChange({ ...colMap, status: v || null })}
        />
        <ColMapRow
          label="Date created column"
          hint="When the lead was received — used for monthly breakdowns (optional)"
          required={false}
          value={colMap.created || ''}
          options={opts}
          onChange={(v) => onChange({ ...colMap, created: v || null })}
        />
      </div>
    </div>
  );
}

function ColMapRow({ label, hint, required, value, options, onChange }: {
  label: string;
  hint: string;
  required: boolean;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="col-map-row">
      <div>
        <span className="col-map-label">{label}{required && <span className="col-map-req"> *</span>}</span>
        <span className="hint"> — {hint}</span>
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={!value && required ? 'col-map-select required' : 'col-map-select'}>
        <option value="">{required ? '— select a column —' : '— not in this file —'}</option>
        {options.filter(Boolean).map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );
}

// ---- Bench + LegendPreview ----
function Bench(props: { title: string; hint: string; unit: string; good: number; bad: number; onGood: (v: number) => void; onBad: (v: number) => void; goodLabel: string; badLabel: string; }) {
  const Wrap = props.unit === '$' ? 'money-wrap' : 'pct-wrap';
  return (
    <div className="bench-block">
      <div className="bench-name">{props.title} <span className="hint">{props.hint}</span></div>
      <div className="thr-row">
        <div><label>{props.goodLabel}</label><div className={Wrap}><input type="number" value={props.good} min={0} onChange={(e) => props.onGood(parseFloat(e.target.value) || 0)} /></div></div>
        <div><label>{props.badLabel}</label><div className={Wrap}><input type="number" value={props.bad} min={0} onChange={(e) => props.onBad(parseFloat(e.target.value) || 0)} /></div></div>
      </div>
    </div>
  );
}

export function LegendPreview({ thr }: { thr: Thresholds }) {
  return (
    <table className="legend" style={{ marginTop: 18 }}>
      <thead><tr><th className="l">Performance tier</th><th>Cost per good lead</th><th>Closing rate</th><th>Cost per sold</th></tr></thead>
      <tbody>
        <tr><td className="l"><span className="tier-dot cpa-good" /><b>Good</b></td><td className="cpa-good">Under {fmt$(thr.cpl.good)}</td><td className="cpa-good">Over {thr.close.good}%</td><td className="cpa-good">Under {fmt$(thr.cpa.good)}</td></tr>
        <tr><td className="l"><span className="tier-dot cpa-ok" /><b>Medium</b></td><td className="cpa-ok">{fmt$(thr.cpl.good)} to {fmt$(thr.cpl.bad)}</td><td className="cpa-ok">{thr.close.bad}% to {thr.close.good}%</td><td className="cpa-ok">{fmt$(thr.cpa.good)} to {fmt$(thr.cpa.bad)}</td></tr>
        <tr><td className="l"><span className="tier-dot cpa-bad" /><b>Bad</b></td><td className="cpa-bad">Over {fmt$(thr.cpl.bad)}</td><td className="cpa-bad">Under {thr.close.bad}%</td><td className="cpa-bad">Over {fmt$(thr.cpa.bad)}</td></tr>
      </tbody>
    </table>
  );
}
