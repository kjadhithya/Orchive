'use client';
import { useState } from 'react';
import Link from 'next/link';
import { sb } from '@/lib/supabase';
import { AuthCard, AuthError } from '@/components/AuthCard';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/update-password` });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  };
  if (sent) return (
    <AuthCard title="Check your email" sub={`If ${email} has an account, a reset link is on its way.`}>
      <Link className="btn sec" href="/login">Back to sign in</Link>
    </AuthCard>
  );
  return (
    <AuthCard title="Reset your password" sub="Enter your email and we’ll send you a link to set a new password.">
      <form onSubmit={submit} className="col" style={{ gap: 12 }}>
        <label className="field"><span>Email</span><input className="text-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <AuthError msg={err} />
        <button className="btn pri" type="submit" disabled={busy} style={{ height: 40 }}>{busy ? 'Sending…' : 'Send reset link'}</button>
      </form>
      <Link href="/login" style={{ fontSize: 13 }}>Back to sign in</Link>
    </AuthCard>
  );
}
