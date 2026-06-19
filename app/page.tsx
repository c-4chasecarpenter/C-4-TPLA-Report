'use client';
import { useState } from 'react';
import SetupForm from '@/components/SetupForm';
import Report from '@/components/report/Report';
import { ReportData } from '@/lib/types';

export default function Home() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [editFrom, setEditFrom] = useState<ReportData | null>(null);

  function handleEdit(data: ReportData) {
    setEditFrom(data);
    setReport(null);
  }

  return (
    <div className="wrap">
      <div className="mast">
        <img src="/logo-c4.png" alt="C-4 Analytics" className="mast-logo" />
        <div className="mast-text">
          <div className="mast-eyebrow">C-4 Analytics</div>
          <h1>Third Party Lead Source Report</h1>
        </div>
      </div>
      {report
        ? <Report data={report} onEdit={handleEdit} />
        : <SetupForm onGenerate={(r) => { setReport(r); setEditFrom(null); }} initialData={editFrom} />}
    </div>
  );
}
