'use client';
import { useState } from 'react';
import { Thresholds } from '@/lib/types';
import { fmt$, pct, loBetter, hiBetter } from '@/lib/format';

export default function ProjectionSlider({ spend, good, sold, t, label }: { spend: number; good: number; sold: number; t: Thresholds; label?: string }) {
  if (good <= 0) return null;
  const curRate = sold > 0 ? (sold / good) * 100 : 0;
  const curCpa = sold > 0 ? spend / sold : null;
  const curCls = loBetter(curCpa, t.cpa.good, t.cpa.bad);
  const rateCls = hiBetter(curRate > 0 ? curRate : null, t.close.good, t.close.bad);
  const def = curRate > 0 ? Math.round(curRate * 2) / 2 : 10;
  const max = 50;

  const [rate, setRate] = useState(def);
  const sales = good * (rate / 100);
  const cpa = sales > 0 ? spend / sales : null;
  const cls = loBetter(cpa, t.cpa.good, t.cpa.bad);
  const diff = cpa !== null && curCpa !== null ? cpa - curCpa : null;

  let delta = { cls: 'eq', text: 'no current sales to compare' };
  if (diff !== null) {
    if (Math.abs(diff) < 1) delta = { cls: 'eq', text: 'matches current' };
    else if (diff < 0) delta = { cls: 'dn', text: fmt$(-diff) + ' cheaper per sale' };
    else delta = { cls: 'up', text: fmt$(diff) + ' more per sale' };
  }
  const pctv = ((rate - 1) / (max - 1)) * 100;

  return (
    <div className="proj" data-proj="1" data-spend={spend} data-good={good} data-cg={t.cpa.good} data-cb={t.cpa.bad}
      data-curcpa={curCpa === null ? '' : curCpa} data-rate={rate}>
      <div className="proj-head">
        <div className="sub">Spend and leads stay fixed. Drag the slider to see what cost per sale becomes if the store closes these leads at a different rate.</div></div>
      <div className="proj-body">
        <div className="proj-now">
          <div className="pp-lab">Current</div>
          <div className={`pp-rate${rateCls ? ' cpa-' + rateCls : ''}`}>{curRate > 0 ? curRate.toFixed(1) : '0.0'}<span className="u">%</span></div>
          <div className={'pp-cpa' + (curCls ? ' cpa-' + curCls : '')}>{curCpa === null ? 'No sales yet' : fmt$(curCpa) + ' / sale'}</div>
          <div className="pp-foot">{sold.toLocaleString()} sold of {good.toLocaleString()} good leads</div>
        </div>
        <div className="proj-arrow">&rarr;</div>
        <div className="proj-what">
          <div className="pp-lab">If the store closed at <b className="proj-out-rate" style={{ color: 'var(--ink)' }}>{rate.toFixed(1)}%</b></div>
          <div className="slider-wrap">
            <div className="c4-slider-row">
              <input type="range" className="proj-slider" min={1} max={max} step={0.5} value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                style={{ background: `linear-gradient(90deg, var(--orange) 0%, var(--orange) ${pctv}%, var(--line) ${pctv}%, var(--line) 100%)` }} />
              <div className="pct-wrap c4-slider-input">
                <input type="number" min={1} max={max} step={0.5} value={rate}
                  onChange={(e) => setRate(Math.min(max, Math.max(1, parseFloat(e.target.value) || 1)))} />
              </div>
            </div>
            <div className="ticks"><span>1%</span><span>10%</span><span>20%</span><span>35%</span><span>{max}%</span></div>
          </div>
          <div className={'pp-cpa proj-out-cpa' + (cls ? ' cpa-' + cls : '')}>{cpa === null ? '\u2014' : fmt$(cpa) + ' / sale'}</div>
          <div className="pp-foot"><span className="proj-out-sales">~{Math.round(sales).toLocaleString()}</span> sales projected<span className={'delta proj-out-delta ' + delta.cls}>{delta.text}</span></div>
        </div>
      </div>
    </div>
  );
}
