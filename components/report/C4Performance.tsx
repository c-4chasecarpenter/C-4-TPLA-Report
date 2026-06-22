'use client';
import { ReportData } from '@/lib/types';
import { fmt$, pct, metricsRow, profitCls } from '@/lib/format';
import { Kpi, GrossThs, GrossTds, ProfitKpiVal } from './parts';
import { C4Data, C4Computed, C4LeadType, isWebsiteKey } from '@/lib/c4';

// Shared edit toggle shown at the top of both C-4 tabs.
export function C4EditBar({ editMode, onToggle, onSave }: { editMode: boolean; onToggle: (v: boolean) => void; onSave: () => void }) {
  return (
    <div className="c4-editbar">
      <label className="switch">
        <input type="checkbox" checked={editMode} onChange={(e) => onToggle(e.target.checked)} />
        <span className="track" />Edit C-4 data
      </label>
      {editMode
        ? <button className="btn btn-primary" onClick={onSave}>Save &amp; lock</button>
        : <span className="c4-edit-hint">Toggle on to enter spend and leads. Saved to this browser.</span>}
    </div>
  );
}

export default function C4Performance({ c4, computed, d, showSold, editMode, onToggle, onSave, onChange }: {
  c4: C4Data;
  computed: C4Computed;
  d: ReportData;
  showSold: boolean;
  editMode: boolean;
  onToggle: (v: boolean) => void;
  onSave: () => void;
  onChange: (c4: C4Data) => void;
}) {
  const t = d.t;
  const c = computed;

  // ---- mutations ----
  function setSpend(mk: string, v: number) {
    const months = { ...c4.months, [mk]: { ...(c4.months[mk] ?? { spend: 0, leads: {} }), spend: v } };
    onChange({ ...c4, months });
  }
  function setLead(mk: string, key: string, v: number) {
    const m = c4.months[mk] ?? { spend: 0, leads: {} };
    const months = { ...c4.months, [mk]: { ...m, leads: { ...m.leads, [key]: v } } };
    onChange({ ...c4, months });
  }
  function updateType(i: number, patch: Partial<C4LeadType>) {
    const leadTypes = c4.leadTypes.map((lt, idx) => {
      if (idx !== i) return lt;
      const next = { ...lt, ...patch };
      if (patch.key !== undefined) next.website = isWebsiteKey(patch.key); // re-derive website flag from key
      return next;
    });
    onChange({ ...c4, leadTypes });
  }
  function addType() {
    onChange({ ...c4, leadTypes: [...c4.leadTypes, { key: `lead_${c4.leadTypes.length + 1}`, label: 'New lead type', website: false }] });
  }
  function removeType(i: number) {
    onChange({ ...c4, leadTypes: c4.leadTypes.filter((_, idx) => idx !== i) });
  }
  function setBudget(v: number) {
    onChange({ ...c4, budget: v });
  }
  function setRange(which: 'start' | 'end', v: string) {
    onChange({ ...c4, range: { ...c4.range, [which]: v || null } });
  }

  const numCell = (val: number, onSet: (v: number) => void, dollar = false) =>
    editMode ? (
      <input type="number" className="spend-cell-input" min={0} placeholder={dollar ? '0' : '—'}
        value={val > 0 ? val : ''} onChange={(e) => onSet(parseFloat(e.target.value) || 0)} />
    ) : (
      <span>{dollar ? fmt$(val) : val.toLocaleString()}</span>
    );

  const websiteTypes = computed.byType.filter((x) => x.type.website);
  const otherTypes = computed.byType.filter((x) => !x.type.website);
  const maxTypeLeads = Math.max(1, ...computed.byType.map((x) => x.leads));

  return (
    <>
      <C4EditBar editMode={editMode} onToggle={onToggle} onSave={onSave} />

      <div className="panel-head">
        <div className="h">C-4 Analytics Performance</div>
        <div className="spend-tag"><b>{fmt$(c.spend)}</b> tracked spend · {c.months} mo active</div>
      </div>

      {!c.hasData && !editMode && (
        <div className="c4-empty">No C-4 data yet. Toggle <b>Edit C-4 data</b> above to enter monthly spend and leads.</div>
      )}

      {/* KPI tiles — mirror the Overview tab */}
      <div className="kpis">
        <Kpi label="Tracked spend" val={fmt$(c.spend)} foot={`${c.months} active month${c.months === 1 ? '' : 's'}`} />
        <Kpi label="Good leads" val={Math.round(c.leads).toLocaleString()} foot={`${websiteTypes.reduce((s, x) => s + x.leads, 0).toLocaleString()} from website`} />
        <Kpi label="Cost / good lead" val={c.metrics.cpl === null ? '—' : fmt$(c.metrics.cpl, 2)} foot="C-4 channels" cls={c.metrics.cplCls} />
        <Kpi label="Vehicles sold" val={c.sold.toLocaleString()} foot="projected" only="sold" />
        <Kpi label="Cost / sold" val={c.metrics.cpa === null ? '—' : fmt$(c.metrics.cpa)} foot="projected" cls={c.metrics.cpaCls} only="sold" />
        <Kpi label="Closing rate" val={c.crmClose > 0 ? pct(c.crmClose) : '—'} foot="blended CRM avg" cls={c.metrics.closeCls} only="sold" />
        <Kpi label="Total gross" val={fmt$(c.gross)} foot="projected" only="gross" />
        <Kpi label="Return / Profit" val={<ProfitKpiVal gross={c.gross} spend={c.spend} />} foot="gross vs spend" cls={profitCls(c.gross, c.spend)} only="gross" />
      </div>

      <div className="c4-note sold-only">
        Sold and cost-per-sold are <b>projected</b>: C-4 drives traffic but the CRM doesn&apos;t track the sale back to us, so
        C-4&apos;s {Math.round(c.leads).toLocaleString()} leads are closed at the entire report&apos;s blended CRM rate of <b>{pct(c.crmClose)}</b>
        {c.grossPerSold > 0 ? <>, and gross is projected at <b>{fmt$(c.grossPerSold)}</b>/sold (blended CRM average)</> : null}.
      </div>

      {/* C-4 active date range — C-4 often starts partway through the report period */}
      {editMode && d.mkeys[0] !== 'all' && (
        <div className="c4-range">
          <span className="c4-range-lab">C-4 active date range <span className="hint">limit to the months C-4 was actually running</span></span>
          <div className="c4-range-fields">
            <label>Start
              <select value={c4.range.start ?? ''} onChange={(e) => setRange('start', e.target.value)}>
                <option value="">First month</option>
                {d.mkeys.map((k, i) => <option key={k} value={k}>{d.mlabels[i]}</option>)}
              </select>
            </label>
            <span className="c4-range-arrow">→</span>
            <label>End
              <select value={c4.range.end ?? ''} onChange={(e) => setRange('end', e.target.value)}>
                <option value="">Last month</option>
                {d.mkeys.map((k, i) => <option key={k} value={k}>{d.mlabels[i]}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}
      {!editMode && c.monthKeys.length > 0 && c.monthKeys.length < d.mkeys.length && (
        <div className="c4-range-note">C-4 active range: <b>{c.byMonth[0].label} – {c.byMonth[c.byMonth.length - 1].label}</b> ({c.months} of {d.months} report months).</div>
      )}

      {/* Monthly budget — reference only, separate from the true monthly spend below */}
      {(editMode || c4.budget > 0) && (
        <div className="c4-budget">
          <div className="c4-budget-main">
            <span className="c4-budget-lab">Monthly budget <span className="hint">reference only — actual spend is entered per month</span></span>
            {editMode ? (
              <div className="money-wrap c4-budget-input">
                <input type="number" min={0} placeholder="0" value={c4.budget || ''} onChange={(e) => setBudget(parseFloat(e.target.value) || 0)} />
                <span className="month-tag">/ mo</span>
              </div>
            ) : (
              <span className="c4-budget-val">{fmt$(c4.budget)}/mo</span>
            )}
          </div>
          {c4.budget > 0 && (
            <div className="c4-budget-compare">
              Budgeted <b>{fmt$(c4.budget * c.months)}</b> over {c.months} active mo · actual tracked <b>{fmt$(c.spend)}</b>
              {' '}({c.spend <= c4.budget * c.months ? fmt$(c4.budget * c.months - c.spend) + ' under' : fmt$(c.spend - c4.budget * c.months) + ' over'})
            </div>
          )}
        </div>
      )}

      {/* Lead breakdown by type */}
      <div className="sec-label"><h3>Lead breakdown</h3><span className="note">All C-4 leads by type — anything tracked as <code>asc_</code> is a website lead</span></div>
      <div className="card card-pad">
        <div className="c4-breakdown">
          <div className="c4-bd-group">
            <div className="pbar-gtitle">Website leads <span className="pbar-hint">{websiteTypes.reduce((s, x) => s + x.leads, 0).toLocaleString()} total</span></div>
            {websiteTypes.length === 0 && <div className="c4-bd-empty">No website lead types.</div>}
            {websiteTypes.map((x) => (
              <div key={x.type.key} className="pbar-row">
                <div className="pbar-name">{x.type.label}</div>
                <div className="pbar-track"><div className="pbar-fill pbar-neutral" style={{ width: `${(x.leads / maxTypeLeads) * 100}%` }} /></div>
                <div className="pbar-num">{x.leads.toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="c4-bd-group">
            <div className="pbar-gtitle">Google &amp; other leads <span className="pbar-hint">{otherTypes.reduce((s, x) => s + x.leads, 0).toLocaleString()} total</span></div>
            {otherTypes.length === 0 && <div className="c4-bd-empty">No other lead types.</div>}
            {otherTypes.map((x) => (
              <div key={x.type.key} className="pbar-row">
                <div className="pbar-name">{x.type.label}</div>
                <div className="pbar-track"><div className="pbar-fill pbar-neutral" style={{ width: `${(x.leads / maxTypeLeads) * 100}%` }} /></div>
                <div className="pbar-num">{x.leads.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lead type catalog editor (edit mode only) */}
      {editMode && (
        <>
          <div className="sec-label"><h3>Lead types</h3><span className="note">Rename, add, or remove the conversions you track. Keys starting with <code>asc_</code> count as website leads.</span></div>
          <div className="card card-pad">
            <div className="c4-types">
              <div className="c4-types-head"><span>Label</span><span>Tracking key</span><span>Source</span><span /></div>
              {c4.leadTypes.map((lt, i) => (
                <div className="c4-types-row" key={i}>
                  <input type="text" value={lt.label} onChange={(e) => updateType(i, { label: e.target.value })} placeholder="Web Phone Call" />
                  <input type="text" value={lt.key} onChange={(e) => updateType(i, { key: e.target.value })} placeholder="asc_click_to_call" />
                  <span className={'c4-src-badge ' + (lt.website ? 'web' : 'other')}>{lt.website ? 'Website' : 'Google / other'}</span>
                  <button className="rm" title="Remove" onClick={() => removeType(i)}>&times;</button>
                </div>
              ))}
              <button className="btn btn-add" onClick={addType}>+ Add lead type</button>
            </div>
          </div>
        </>
      )}

      {/* Month by month: spend + per-type leads */}
      <div className="sec-label"><h3>By month</h3><span className="note">Spend and leads per month{editMode ? ' — enter values in the cells' : ''}</span></div>
      <div className="card c4-mtab-wrap">
        <table className="mtab c4-mtab">
          <thead>
            <tr>
              <th className="l">Month</th>
              <th>Spend</th>
              {c4.leadTypes.map((lt) => <th key={lt.key} className="c4-type-col">{lt.label}</th>)}
              <th>Leads</th>
              <th className="sold-col">Sold</th>
              <th>Cost / lead</th>
              <th className="sold-col">Cost / sold</th>
              <GrossThs />
            </tr>
          </thead>
          <tbody>
            {c.byMonth.map((bm) => {
              const mk = bm.key;
              const m = c4.months[mk] ?? { spend: 0, leads: {} };
              const soldR = Math.round(bm.sold);
              const r = metricsRow(bm.spend, bm.leads, soldR, t);
              return (
                <tr key={mk}>
                  <td className="l">{bm.label}</td>
                  <td>{numCell(m.spend || 0, (v) => setSpend(mk, v), true)}</td>
                  {c4.leadTypes.map((lt) => (
                    <td key={lt.key} className="c4-type-col">{numCell(m.leads?.[lt.key] ?? 0, (v) => setLead(mk, lt.key, v))}</td>
                  ))}
                  <td><b>{bm.leads.toLocaleString()}</b></td>
                  <td className="sold-col">{soldR.toLocaleString()}</td>
                  <td className={r.cplCls && 'cpa-' + r.cplCls}>{r.cpl === null ? '—' : fmt$(r.cpl, 2)}</td>
                  <td className={'sold-col ' + (r.cpaCls && 'cpa-' + r.cpaCls)}>{r.cpa === null ? '—' : fmt$(r.cpa)}</td>
                  <GrossTds gross={bm.gross} spend={bm.spend} />
                </tr>
              );
            })}
            <tr className="tot-row">
              <td className="l">Period total</td>
              <td>{fmt$(c.spend)}</td>
              {c4.leadTypes.map((lt) => {
                const tot = c.monthKeys.reduce((s, mk) => s + (c4.months[mk]?.leads?.[lt.key] ?? 0), 0);
                return <td key={lt.key} className="c4-type-col">{tot.toLocaleString()}</td>;
              })}
              <td><b>{Math.round(c.leads).toLocaleString()}</b></td>
              <td className="sold-col">{c.sold.toLocaleString()}</td>
              <td className={c.metrics.cplCls && 'cpa-' + c.metrics.cplCls}>{c.metrics.cpl === null ? '—' : fmt$(c.metrics.cpl, 2)}</td>
              <td className={'sold-col ' + (c.metrics.cpaCls && 'cpa-' + c.metrics.cpaCls)}>{c.metrics.cpa === null ? '—' : fmt$(c.metrics.cpa)}</td>
              <GrossTds gross={c.gross} spend={c.spend} />
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
