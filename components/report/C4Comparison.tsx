'use client';
import { useState } from 'react';
import { ReportData } from '@/lib/types';
import { fmt$, pct } from '@/lib/format';
import { C4Computed, C4Comparison as Cmp, buildComparison, c4Recommendations, reallocate } from '@/lib/c4';
import { C4EditBar } from './C4Performance';

export default function C4Comparison({ computed, d, showSold, editMode, onToggle, onSave }: {
  computed: C4Computed;
  d: ReportData;
  showSold: boolean;
  editMode: boolean;
  onToggle: (v: boolean) => void;
  onSave: () => void;
}) {
  const cmp = buildComparison(computed, d);
  const recs = c4Recommendations(computed, cmp, d);
  const H = (cls: string) => (showSold ? cls : cls + ' hidden');

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
            {showSold && (
              <ScoreCard
                label="Cost per sold vs third parties"
                big={cmp.cpaEdgePct === null ? '—' : (cmp.cpaEdgePct >= 0 ? `${cmp.cpaEdgePct.toFixed(0)}% cheaper` : `${Math.abs(cmp.cpaEdgePct).toFixed(0)}% pricier`)}
                good={(cmp.cpaEdgePct ?? 0) >= 0}
                sub={`C-4 ${computed.metrics.cpa === null ? '—' : fmt$(computed.metrics.cpa)} vs ${cmp.thirdBlended.m.cpa === null ? '—' : fmt$(cmp.thirdBlended.m.cpa)} blended`}
              />
            )}
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
            <table className="cmp">
              <thead>
                <tr>
                  <th className="l">Channel</th>
                  <th>Spend</th>
                  <th>Leads</th>
                  <th>Cost / lead</th>
                  <th className={showSold ? '' : 'hidden'}>Sold</th>
                  <th className={showSold ? '' : 'hidden'}>Cost / sold</th>
                  <th className={showSold ? '' : 'hidden'}>Closing</th>
                </tr>
              </thead>
              <tbody>
                <CmpRow row={cmp.c4} showSold={showSold} highlight />
                {cmp.rows.map((r) => <CmpRow key={r.name} row={r} showSold={showSold} />)}
                <tr className="tot-row">
                  <td className="l">{cmp.thirdBlended.name}</td>
                  <td>{fmt$(cmp.thirdBlended.spend)}</td>
                  <td>{cmp.thirdBlended.leads.toLocaleString()}</td>
                  <td className={cmp.thirdBlended.m.cplCls && 'cpa-' + cmp.thirdBlended.m.cplCls}>{cmp.thirdBlended.m.cpl === null ? '—' : fmt$(cmp.thirdBlended.m.cpl, 2)}</td>
                  <td className={showSold ? '' : 'hidden'}>{cmp.thirdBlended.sold.toLocaleString()}</td>
                  <td className={H(cmp.thirdBlended.m.cpaCls && 'cpa-' + cmp.thirdBlended.m.cpaCls)}>{cmp.thirdBlended.m.cpa === null ? '—' : fmt$(cmp.thirdBlended.m.cpa)}</td>
                  <td className={H(cmp.thirdBlended.m.closeCls && 'cpa-' + cmp.thirdBlended.m.closeCls)}>{cmp.thirdBlended.m.close === null ? '—' : pct(cmp.thirdBlended.m.close)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Recommendations */}
          {recs.length > 0 && (
            <>
              <div className="sec-label"><h3>Recommendations</h3><span className="note">Where the dealership&apos;s money works hardest</span></div>
              <div className="takeaways-grid">
                {recs.map((tw, i) => (
                  <div key={i} className={`takeaway-item tway-${tw.type}`}>
                    <span className="tway-badge">{tw.type === 'scale' ? 'Scale' : tw.type === 'cut' ? 'Reallocate' : tw.type === 'watch' ? 'Watch' : 'Note'}</span>
                    <div className="tway-headline">{tw.headline}</div>
                    <div className="tway-detail">{tw.detail}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Reallocation projector */}
          <div className="sec-label"><h3>Reallocation projector</h3><span className="note">Model moving spend from a third party into C-4 campaigns</span></div>
          <Reallocator cmp={cmp} crmClose={computed.crmClose} showSold={showSold} />
        </>
      )}
    </>
  );
}

function ScoreCard({ label, big, sub, good }: { label: string; big: string; sub: string; good: boolean }) {
  return (
    <div className={'c4-score ' + (good ? 'is-good' : 'is-bad')}>
      <div className="c4-score-lab">{label}</div>
      <div className="c4-score-big">{big}</div>
      <div className="c4-score-sub">{sub}</div>
    </div>
  );
}

function CmpRow({ row, showSold, highlight }: { row: Cmp['c4']; showSold: boolean; highlight?: boolean }) {
  const H = (cls: string) => (showSold ? cls : cls + ' hidden');
  return (
    <tr className={highlight ? 'c4-row' : ''}>
      <td className="l">
        <div className="name-cell">
          <span className="swatch" style={highlight ? { background: 'var(--orange)' } : undefined} />
          <b>{row.name}</b>
          {highlight && <span className="wintag">C-4</span>}
        </div>
      </td>
      <td>{fmt$(row.spend)}</td>
      <td>{Math.round(row.leads).toLocaleString()}</td>
      <td className={row.m.cplCls && 'cpa-' + row.m.cplCls}>{row.m.cpl === null ? '—' : fmt$(row.m.cpl, 2)}</td>
      <td className={showSold ? '' : 'hidden'}>{Math.round(row.sold).toLocaleString()}</td>
      <td className={H(row.m.cpaCls && 'cpa-' + row.m.cpaCls)}>{row.m.cpa === null ? '—' : fmt$(row.m.cpa)}</td>
      <td className={H(row.m.closeCls && 'cpa-' + row.m.closeCls)}>{row.m.close === null ? '—' : pct(row.m.close)}</td>
    </tr>
  );
}

function Reallocator({ cmp, crmClose, showSold }: { cmp: Cmp; crmClose: number; showSold: boolean }) {
  const candidates = cmp.rows.filter((r) => r.spend > 0 && r.m.cpl !== null);
  const [srcName, setSrcName] = useState(candidates[0]?.name ?? '');
  const source = candidates.find((r) => r.name === srcName) ?? candidates[0];

  const maxAmount = source ? Math.round(source.spend) : 0;
  const [amount, setAmount] = useState(maxAmount ? Math.round(maxAmount / 2) : 0);

  if (!source) {
    return <div className="c4-empty">Add at least one third party with spend and leads to model a reallocation.</div>;
  }
  if (cmp.c4.m.cpl === null) {
    return <div className="c4-empty">Enter C-4 spend and leads first to model a reallocation.</div>;
  }

  const amt = Math.max(0, Math.min(amount, maxAmount));
  const res = reallocate(amt, source, cmp.c4, crmClose);
  const pctv = maxAmount > 0 ? (amt / maxAmount) * 100 : 0;
  const leadUp = res.leadDelta >= 0;

  return (
    <div className="card card-pad c4-realloc">
      <div className="c4-realloc-controls">
        <div className="c4-realloc-field">
          <label>Move spend from</label>
          <select value={srcName} onChange={(e) => { setSrcName(e.target.value); const s = candidates.find((r) => r.name === e.target.value); setAmount(s ? Math.round(s.spend / 2) : 0); }}>
            {candidates.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </div>
        <div className="c4-realloc-field grow">
          <label>Amount to reallocate to C-4: <b>{fmt$(amt)}</b> of {fmt$(maxAmount)}</label>
          <input type="range" className="proj-slider" min={0} max={maxAmount} step={Math.max(1, Math.round(maxAmount / 100))} value={amt}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            style={{ background: `linear-gradient(90deg, var(--orange) 0%, var(--orange) ${pctv}%, var(--line) ${pctv}%, var(--line) 100%)` }} />
        </div>
      </div>

      <div className="c4-realloc-grid">
        <ReallocCard title={`${source.name} (reduced)`} side={res.sourceAfter} before={source} showSold={showSold} />
        <div className="c4-realloc-arrow">&rarr;</div>
        <ReallocCard title="C-4 Analytics (boosted)" side={res.c4After} before={cmp.c4} showSold={showSold} accent />
      </div>

      <div className="c4-realloc-result">
        <div className={'c4-rr-hero ' + (leadUp ? 'is-good' : 'is-bad')}>
          <span className="c4-rr-num">{leadUp ? '+' : ''}{Math.round(res.leadDelta).toLocaleString()}</span>
          <span className="c4-rr-lab">net leads on the same {fmt$(res.totalSpend)} total spend</span>
        </div>
        <div className="c4-rr-stats">
          <div><span className="c4-rr-k">Combined cost / lead</span><span className="c4-rr-v">{res.combinedCplBefore === null ? '—' : fmt$(res.combinedCplBefore, 2)} → <b>{res.combinedCplAfter === null ? '—' : fmt$(res.combinedCplAfter, 2)}</b></span></div>
          {showSold && <div><span className="c4-rr-k">Projected sold</span><span className="c4-rr-v">{Math.round(res.totalSoldBefore).toLocaleString()} → <b>{Math.round(res.totalSoldAfter).toLocaleString()}</b> ({res.soldDelta >= 0 ? '+' : ''}{Math.round(res.soldDelta).toLocaleString()})</span></div>}
        </div>
        <div className="c4-rr-foot">Leads scale at each channel&apos;s current cost per lead; projected sold applies the {pct(crmClose)} blended CRM close rate. A modeled estimate, not a guarantee.</div>
      </div>
    </div>
  );
}

function ReallocCard({ title, side, before, showSold, accent }: { title: string; side: { spend: number; leads: number; sold: number }; before: { spend: number; leads: number; sold: number }; showSold: boolean; accent?: boolean }) {
  const dLeads = side.leads - before.leads;
  return (
    <div className={'c4-realloc-card' + (accent ? ' accent' : '')}>
      <div className="c4-rc-title">{title}</div>
      <div className="c4-rc-row"><span>Spend</span><span>{fmt$(before.spend)} → <b>{fmt$(side.spend)}</b></span></div>
      <div className="c4-rc-row"><span>Leads</span><span>{Math.round(before.leads).toLocaleString()} → <b>{Math.round(side.leads).toLocaleString()}</b> <em className={dLeads >= 0 ? 'up' : 'dn'}>({dLeads >= 0 ? '+' : ''}{Math.round(dLeads).toLocaleString()})</em></span></div>
      {showSold && <div className="c4-rc-row"><span>Sold</span><span>{Math.round(before.sold).toLocaleString()} → <b>{Math.round(side.sold).toLocaleString()}</b></span></div>}
    </div>
  );
}
