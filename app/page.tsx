'use client';
import { useState } from 'react';
import SetupForm from '@/components/SetupForm';
import Report from '@/components/report/Report';
import { ReportData } from '@/lib/types';

export default function Home() {
  const [report, setReport] = useState<ReportData | null>(null);
  return (
    <div className="wrap">
      <div className="mast"><span className="gauge" /><h1>Third Party Lead Source Report</h1></div>
      {report
        ? <Report data={report} onEdit={() => setReport(null)} />
        : <SetupForm onGenerate={setReport} />}
    </div>
  );
}
