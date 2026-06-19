'use client';
import { useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { ReportData } from '@/lib/types';
import { buildSlidesPayload } from '@/lib/slidesPayload';

export default function GeneratePresentationButton({ data, showSold }: { data: ReportData; showSold: boolean }) {
  const { data: session, status } = useSession();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string; url?: string } | null>(null);

  async function generate() {
    setBusy(true); setMsg(null);
    try {
      const payload = buildSlidesPayload(data, showSold);
      const res = await fetch('/api/generate-slides', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Generation failed');
      setMsg({ kind: 'ok', text: 'Deck created.', url: json.url });
      window.open(json.url, '_blank');
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message || 'Something went wrong.' });
    } finally { setBusy(false); }
  }

  if (status !== 'authenticated') {
    return (
      <button className="btn btn-gen" onClick={() => signIn('google')}>
        Sign in with Google to generate slides
      </button>
    );
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button className="btn btn-gen" disabled={busy} onClick={generate}>
        {busy ? 'Building deck...' : 'Generate presentation'}
      </button>
      {msg && (
        <span className={'gen-status ' + msg.kind}>
          {msg.text}{msg.url && <> <a href={msg.url} target="_blank" rel="noreferrer">Open</a></>}
        </span>
      )}
    </span>
  );
}
