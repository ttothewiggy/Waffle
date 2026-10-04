"use client";
import { useEffect, useState } from 'react';
import { useJournalAccount } from './CloudAccount';
import { aiHeaders } from '@/lib/ai/session';
export function useAiAccess() {
  const { session } = useJournalAccount();
  const id = session?.user.id;
  const [result, setResult] = useState<{ id?: string; allowed: boolean; message: string }>({ allowed: false, message: '' });
  const [attempt, retry] = useState(0);
  useEffect(() => {
    if (!id) return;
    let disposed = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    void (async () => {
      try {
        const headers = await aiHeaders();
        const response = await fetch('/api/ai/access', { headers, signal: controller.signal, cache: 'no-store' });
        const body = await response.json();
        if (!disposed) setResult({ id, allowed: response.ok && body.allowed === true, message: response.ok ? '' : body.error || 'Could not check your AI access.' });
      } catch {
        if (!disposed) setResult({ id, allowed: false, message: 'Connect to the internet to check your AI access.' });
      } finally { clearTimeout(timeout); }
    })();
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [id, attempt]);
  return {
    allowed: !!id && result.id === id && result.allowed,
    message: !id ? 'Sign in to use dictation and AI polishing.' : result.id === id ? result.message : 'Checking your AI access…',
    signedIn: !!id,
    retry: () => { setResult({ allowed: false, message: '' }); retry(n => n + 1); },
  };
}
export default function AiAccess({ access, close }: { access: ReturnType<typeof useAiAccess>; close: () => void | Promise<boolean | void> }) {
  if (access.allowed) return null;
  return <div className="ai-access-note">
    <p role="status">{access.message}</p>
    {access.signedIn ? <button className="secondary" onClick={access.retry}>Check again</button> :
      <button className="primary" onClick={async () => { if (await close() !== false) window.location.hash = 'settings'; }}>Sign in</button>}
  </div>;
}
