'use client';
import { useState } from 'react';
import { ReportData } from '@/lib/types';
import { fmt$, pct, roas, fmtMult } from '@/lib/format';
import { C4Computed, C4Comparison as Cmp, buildComparison, crmCloseDetail, Allocation, summarizeAllocations } from '@/lib/c4';
import { C4EditBar } from './C4Performance';
import { GrossThs, GrossTds } from './parts';

export default function C4Comparison({ computed, d, showSold, editMode, onToggle, onSave }: {
  computed: C4Computed;
  d: ReportData;
  showSold: boolean;
  editMode: boolean;
  onToggle: (v: boolean) => void;
  onSave: () => void;
}) {
  const cmp = buildComparison(computed, d);
  const close = crmCloseDetail(d);

  return (
    <>
      <C4EditBar editMode={editMode} onToggle={onToggle} onSave={onSave} />

      <div className="panel-head">
        <div className="h">C-4 vs Third Parties</div>
        <div className="spend-tag">Head-to-head efficiency</div>
      </div>

      {!computed.hasData ? (
        <div className="c4-empty">No C-4 data yet. Toggle <b>Edit C-4 data</b> above (or on the C-4 Performance tab) to populate this comparison.</div>
      ) : (
        <>
          {/* Headline scoreboard */}
          <div className="c4-scoreboard">
            <ScoreCard
              label="Cost per lead vs third parties"
              big={cmp.cplEdgePct === null ? '—' : (cmp.cplEdgePct >= 0 ? `${cmp.cplEdgePct.toFixed(0)}% cheaper` : `${Math.abs(cmp.cplEdgePct).toFixed(0)}% pricier`)}
              good={(cmp.cplEdgePct ?? 0) >= 0}
              sub={`C-4 ${computed.metrics.cpl === null ? '—' : fmt$(computed.metrics.cpl, 2)} vs ${cmp.thirdBlended.m.cpl === null ? '—' : fmt$(cmp.thirdBlended.m.cpl, 2)} blended`}
            />
            <ScoreCard
              label="Beats on cost per lead"
              big={`${cmp.beatsCplCount} of ${cmp.rows.length}`}
              good={cmp.beatsCplCount >= Math.ceil(cmp.rows.length / 2)}
              sub="third parties undercut by C-4"
            />
            <ScoreCard
              only="sold"
              label="Cost per sold vs third parties"
              big={cmp.cpaEdgePct === null ? '—' : (cmp.cpaEdgePct >= 0 ? `${cmp.cpaEdgePct.toFixed(0)}% cheaper` : `${Math.abs(cmp.cpaEdgePct).toFixed(0)}% pricier`)}
              good={(cmp.cpaEdgePct ?? 0) >= 0}
              sub={`C-4 ${computed.metrics.cpa === null ? '—' : fmt$(computed.metrics.cpa)} vs ${cmp.thirdBlended.m.cpa === null ? '—' : fmt$(cmp.thirdBlended.m.cpa)} blended`}
            />
            <ScoreCard
              only="gross"
              label="Return on spend"
              big={fmtMult(roas(computed.gross, computed.spend))}
              good={(roas(computed.gross, computed.spend) ?? 0) >= (roas(cmp.thirdBlended.gross, cmp.thirdBlended.spend) ?? 0)}
              sub={`C-4 vs ${fmtMult(roas(cmp.thirdBlended.gross, cmp.thirdBlended.spend))} blended (gross ÷ spend)`}
            />
            <ScoreCard
              label="Lead volume"
              big={Math.round(computed.leads).toLocaleString()}
              good={computed.leads >= cmp.thirdBlended.leads}
              sub={`vs ${cmp.thirdBlended.leads.toLocaleString()} from all third parties`}
            />
          </div>

          {/* Side-by-side table */}
          <div className="sec-label"><h3>Side by side</h3><span className="note">C-4 against every configured third party (lower cost is better)</span></div>
          <div className="card">
            <table className="cmp cmp-c4">
              <thead>
                <tr>
                  <th className="l">Channel</th>
                  <th>Spend / mo</th>
                  <th>Spend (period)</th>
                  <th>Leads</th>
                  <th>Cost / lead</th>
                  <th className="sold-col">Sold</th>
                  <th className="sold-col">Cost / sold</th>
                  <th className="sold-col">Closing</th>
                  <GrossThs />
                </tr>
              </thead>
              <tbody>
                <CmpRow row={cmp.c4} highlight />
                {cmp.rows.map((r) => <CmpRow key={r.name} row={r} />)}
                <tr className="tot-row">
                  <td className="l">{cmp.thirdBlended.name}</td>
                  <td>{fmt$(cmp.thirdBlended.monthly)}</td>
                  <td>{fmt$(cmp.thirdBlended.spend)}</td>
                  <td>{cmp.thirdBlended.leads.toLocaleString()}</td>
                  <td className={cmp.thirdBlended.m.cplCls && 'cpa-' + cmp.thirdBlended.m.cplCls}>{cmp.thirdBlended.m.cpl === null ? '—' : fmt$(cmp.thirdBlended.m.cpl, 2)}</td>
                  <td className="sold-col">{cmp.thirdBlended.sold.toLocaleString()}</td>
                  <td className={'sold-col ' + (cmp.thirdBlended.m.cpaCls && 'cpa-' + cmp.thirdBlended.m.cpaCls)}>{cmp.thirdBlended.m.cpa === null ? '—' : fmt$(cmp.thirdBlended.m.cpa)}</td>
                  <td className={'sold-col ' + (cmp.thirdBlended.m.closeCls && 'cpa-' + cmp.thirdBlended.m.closeCls)}>{cmp.thirdBlended.m.close === null ? '—' : pct(cmp.thirdBlended.m.close)}</td>
                  <GrossTds gross={cmp.thirdBlended.gross} spend={cmp.thirdBlended.spend} />
                </tr>
              </tbody>
            </table>
          </div>
          {showSold && (
            <div className="c4-table-note">
              C-4 closing rate of <b>{pct(close.rate)}</b> is the blended average of <b>every source</b> in the submitted CRM data
              ({close.sold.toLocaleString()} sold of {close.good.toLocaleString()} leads). C-4 drives traffic but the CRM doesn&apos;t
              attribute the sale back to us, so this report-wide average is applied to C-4&apos;s leads to project sold units.
            </div>
          )}

          {/* Reallocation projector */}
          <div className="sec-label"><h3>Reallocation projector</h3><span className="note">Model moving monthly spend from a third party into C-4 campaigns</span></div>
          <Reallocator cmp={cmp} crmClose={close.rate} showSold={showSold} />
        </>
      )}
    </>
  );
}

function ScoreCard({ label, big, sub, good, only }: { label: string; big: string; sub: string; good: boolean; only?: 'sold' | 'gross' }) {
  return (
    <div className={'c4-score ' + (good ? 'is-good' : 'is-bad') + (only ? ' ' + only + '-only' : '')}>
      <div className="c4-score-lab">{label}</div>
      <div className="c4-score-big">{big}</div>
      <div className="c4-score-sub">{sub}</div>
    </div>
  );
}

function CmpRow({ row, highlight }: { row: Cmp['c4']; highlight?: boolean }) {
  return (
    <tr className={highlight ? 'c4-row' : ''}>
      <td className="l">
        <div className="name-cell">
          <span className="swatch" style={highlight ? { background: 'var(--orange)' } : undefined} />
          <b>{row.name}</b>
          {highlight && <span className="wintag">C-4</span>}
        </div>
      </td>
      <td>{fmt$(row.monthly)}</td>
      <td>{fmt$(row.spend)}</td>
      <td>{Math.round(row.leads).toLocaleString()}</td>
      <td className={row.m.cplCls && 'cpa-' + row.m.cplCls}>{row.m.cpl === null ? '—' : fmt$(row.m.cpl, 2)}</td>
      <td className="sold-col">{Math.round(row.sold).toLocaleString()}</td>
      <td className={'sold-col ' + (row.m.cpaCls && 'cpa-' + row.m.cpaCls)}>{row.m.cpa === null ? '—' : fmt$(row.m.cpa)}</td>
      <td className={'sold-col ' + (row.m.closeCls && 'cpa-' + row.m.closeCls)}>{row.m.close === null ? '—' : pct(row.m.close)}</td>
      <GrossTds gross={row.gross} spend={row.spend} />
    </tr>
  );
}

function Reallocator({ cmp, crmClose, showSold }: { cmp: Cmp; crmClose: number; showSold: boolean }) {
  const candidates = cmp.rows.filter((r) => r.monthly > 0 && r.m.cpl !== null);

  const [srcName, setSrcName] = useState(candidates[0]?.name ?? '');
  const source = candidates.find((r) => r.name === srcName) ?? candidates[0];
  const maxMonthly = source ? Math.round(source.monthly) : 0;
  const [amount, setAmount] = useState(maxMonthly ? Math.round(maxMonthly / 2) : 0);
  const [allocs, setAllocs] = useState<Allocation[]>([]);

  if (!source) return <div className="c4-empty">Add at least one third party with spend and leads to model a reallocation.</div>;
  if (cmp.c4.m.cpl === null) return <div className="c4-empty">Enter C-4 spend and leads first to model a reallocation.</div>;

  const amt = Math.max(0, Math.min(amount, maxMonthly));
  const pctv = maxMonthly > 0 ? (amt / maxMonthly) * 100 : 0;

  // Live preview of the single allocation currently dialed in.
  const preview = summarizeAllocations([{ source: source.name, monthly: amt }], cmp, crmClose);
  const leadUp = preview.netLeadsMo >= 0;

  // Committed allocations.
  const summary = summarizeAllocations(allocs, cmp, crmClose);

  function addAlloc() {
    if (amt <= 0) return;
    setAllocs((prev) => {
      const others = prev.filter((a) => a.source !== source!.name);
      return [...others, { source: source!.name, monthly: amt }];
    });
  }
  function editAlloc(a: Allocation) {
    setSrcName(a.source);
    setAmount(a.monthly);
    setAllocs((prev) => prev.filter((x) => x.source !== a.source));
  }
  function deleteAlloc(name: string) {
    setAllocs((prev) => prev.filter((a) => a.source !== name));
  }

  const existing = allocs.find((a) => a.source === source.name);
  const sourcesData = JSON.stringify(candidates.map((r) => ({ name: r.name, monthly: r.monthly, cpl: r.m.cpl, close: r.leads > 0 ? r.sold / r.leads : 0 })));

  return (
    <>
      <div className="card card-pad c4-realloc" data-realloc="1" data-close={crmClose}
        data-c4m={cmp.c4.monthly} data-c4cpl={cmp.c4.m.cpl ?? ''} data-src={source.name} data-amt={amt}
        data-sources={sourcesData} data-sold={showSold ? '1' : ''} data-allocs={JSON.stringify(allocs)}>
        <div className="c4-realloc-controls">
          <div className="c4-realloc-field">
            <label>Move monthly spend from</label>
            <select value={srcName} onChange={(e) => { setSrcName(e.target.value); const s = candidates.find((r) => r.name === e.target.value); setAmount(s ? Math.round(s.monthly / 2) : 0); }}>
              {candidates.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
          </div>
          <div className="c4-realloc-field grow">
            <label>Reallocate to C-4 — drag or type (<span className="realloc-out-avail">{fmt$(maxMonthly)}</span>/mo available)</label>
            <div className="c4-slider-row">
              <input type="range" className="proj-slider" min={0} max={maxMonthly} step={Math.max(1, Math.round(maxMonthly / 100))} value={amt}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                style={{ background: `linear-gradient(90deg, var(--orange) 0%, var(--orange) ${pctv}%, var(--line) ${pctv}%, var(--line) 100%)` }} />
              <div className="money-wrap c4-slider-input">
                <input type="number" min={0} max={maxMonthly} value={amt} onChange={(e) => setAmount(Math.min(maxMonthly, Math.max(0, parseFloat(e.target.value) || 0)))} />
                <span className="month-tag">/ mo</span>
              </div>
            </div>
          </div>
          <button className="btn btn-primary c4-add-btn" onClick={addAlloc} disabled={amt <= 0}>
            {existing ? 'Update' : 'Add'} reallocation
          </button>
        </div>

        <div className="c4-realloc-result">
          <div className={'c4-rr-hero realloc-out-hero ' + (leadUp ? 'is-good' : 'is-bad')}>
            <span className="c4-rr-num realloc-out-net">{leadUp ? '+' : ''}{Math.round(preview.netLeadsMo).toLocaleString()}</span>
            <span className="c4-rr-lab realloc-out-herolab">net leads / month from moving {fmt$(amt)}/mo out of {source.name}</span>
          </div>
          <div className="c4-rr-stats">
            <div><span className="c4-rr-k">Combined cost / lead</span><span className="c4-rr-v realloc-out-cpl">{preview.combinedCplBefore === null ? '—' : fmt$(preview.combinedCplBefore, 2)} → <b>{preview.combinedCplAfter === null ? '—' : fmt$(preview.combinedCplAfter, 2)}</b></span></div>
            <div className="sold-only"><span className="c4-rr-k">Net sold / month</span><span className="c4-rr-v realloc-out-sold">{preview.netSoldMo >= 0 ? '+' : ''}{preview.netSoldMo.toFixed(1)}</span></div>
          </div>
          <div className="c4-rr-foot">Leads scale at each channel&apos;s current cost per lead; projected sold applies the {pct(crmClose)} blended CRM close rate. A modeled estimate, not a guarantee.</div>
        </div>
      </div>

      {/* Committed reallocation plan — wrapped in a stable mount so the downloaded
          HTML's vanilla script can rebuild it as rows are added/edited/removed. */}
      <div className="c4-plan-region">
      {allocs.length > 0 && (
        <>
          <div className="sec-label"><h3>Reallocation plan</h3><span className="note">Recommended monthly budget shifts — edit or remove any row</span></div>
          <div className="card">
            <table className="cmp c4-plan">
              <thead>
                <tr>
                  <th className="l">Channel</th>
                  <th>Current / mo</th>
                  <th>Rec. change</th>
                  <th>Updated / mo</th>
                  <th>Leads / mo</th>
                  <th className="sold-col">Sold / mo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {summary.sourceRows.map((r) => (
                  <tr key={r.name}>
                    <td className="l"><b>{r.name}</b></td>
                    <td>{fmt$(r.currentMonthly)}</td>
                    <td className="cpa-bad">{fmt$(r.change)}</td>
                    <td>{fmt$(r.updatedMonthly)}</td>
                    <td>{Math.round(r.leadsBeforeMo).toLocaleString()} → {Math.round(r.leadsAfterMo).toLocaleString()}</td>
                    <td className="sold-col">{r.soldBeforeMo.toFixed(1)} → {r.soldAfterMo.toFixed(1)}</td>
                    <td className="c4-plan-actions">
                      <button className="c4-row-btn" onClick={() => editAlloc({ source: r.name, monthly: -r.change })} title="Edit">Edit</button>
                      <button className="c4-row-btn del" onClick={() => deleteAlloc(r.name)} title="Remove">Delete</button>
                    </td>
                  </tr>
                ))}
                <tr className="c4-row">
                  <td className="l"><b>{summary.c4Row.name}</b> <span className="wintag">C-4</span></td>
                  <td>{fmt$(summary.c4Row.currentMonthly)}</td>
                  <td className="cpa-good">+{fmt$(summary.c4Row.change)}</td>
                  <td>{fmt$(summary.c4Row.updatedMonthly)}</td>
                  <td>{Math.round(summary.c4Row.leadsBeforeMo).toLocaleString()} → {Math.round(summary.c4Row.leadsAfterMo).toLocaleString()}</td>
                  <td className="sold-col">{summary.c4Row.soldBeforeMo.toFixed(1)} → {summary.c4Row.soldAfterMo.toFixed(1)}</td>
                  <td></td>
                </tr>
                <tr className="tot-row">
                  <td className="l">Net impact</td>
                  <td>{fmt$(summary.totalMovedMonthly)} moved</td>
                  <td>—</td>
                  <td>same total</td>
                  <td className={summary.netLeadsMo >= 0 ? 'cpa-good' : 'cpa-bad'}>{summary.netLeadsMo >= 0 ? '+' : ''}{Math.round(summary.netLeadsMo).toLocaleString()}/mo</td>
                  <td className={'sold-col ' + (summary.netSoldMo >= 0 ? 'cpa-good' : 'cpa-bad')}>{summary.netSoldMo >= 0 ? '+' : ''}{summary.netSoldMo.toFixed(1)}/mo</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="c4-table-note">
            Same total budget, redistributed: combined cost per lead {summary.combinedCplBefore === null ? '—' : fmt$(summary.combinedCplBefore, 2)} → <b>{summary.combinedCplAfter === null ? '—' : fmt$(summary.combinedCplAfter, 2)}</b> across the affected channels.
          </div>

          {/* Updated C-4 investment summary */}
          <div className="sec-label"><h3>Updated C-4 investment</h3><span className="note">What C-4 monthly spend becomes if this plan is approved</span></div>
          <div className="card card-pad">
            <div className="c4-invest">
              <div className="c4-invest-item">
                <div className="c4-invest-lab">Current monthly</div>
                <div className="c4-invest-val">{fmt$(summary.c4Row.currentMonthly)}</div>
              </div>
              <div className="c4-invest-op">+</div>
              <div className="c4-invest-item">
                <div className="c4-invest-lab">Recommended reallocation</div>
                <div className="c4-invest-val cpa-good">+{fmt$(summary.totalMovedMonthly)}</div>
              </div>
              <div className="c4-invest-op">=</div>
              <div className="c4-invest-item total">
                <div className="c4-invest-lab">Updated monthly investment</div>
                <div className="c4-invest-val">{fmt$(summary.c4Row.updatedMonthly)}</div>
              </div>
            </div>
          </div>
        </>
      )}
      </div>{/* /c4-plan-region */}
    </>
  );
}
