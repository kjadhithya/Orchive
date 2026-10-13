'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sb } from '@/lib/supabase';
import { AuthCard, AuthError } from '@/components/AuthCard';

export default function UpdatePassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setErr('Use at least 8 characters.');
    setBusy(true); setErr(null);
    const { error } = await sb().auth.updateUser({ password });
    setBusy(false);
    if (error) setErr(error.message.includes('session') ? 'This reset link has expired. Request a new one.' : error.message);
    else router.replace('/library');
  };
  return (
    <AuthCard title="Set a new password">
      <form onSubmit={submit} className="col" style={{ gap: 12 }}>
        <label className="field"><span>New password</span><input className="text-input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <AuthError msg={err} />
        <button className="btn pri" type="submit" disabled={busy} style={{ height: 40 }}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </AuthCard>
  );
}
