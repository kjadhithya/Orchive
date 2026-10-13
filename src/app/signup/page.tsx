'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { sb } from '@/lib/supabase';
import { AuthCard, AuthError } from '@/components/AuthCard';

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setErr('Use at least 8 characters for your password.');
    if (password !== confirm) return setErr('The two passwords don’t match.');
    setBusy(true); setErr(null);
    const { data, error } = await sb().auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/library` } });
    setBusy(false);
    if (error) return setErr(error.message);
    if (data.session) router.replace('/library');
    else setSent(true);
  };

  if (sent) return (
    <AuthCard title="Check your email" sub={`We sent a confirmation link to ${email}. Open it to finish creating your account.`}>
      <Link className="btn sec" href="/login">Back to sign in</Link>
    </AuthCard>
  );

  return (
    <AuthCard title="Create your account" sub="Free, private, and synced to every device you sign in from.">
      <form onSubmit={submit} className="col" style={{ gap: 12 }}>
        <label className="field"><span>Email</span><input className="text-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Password</span><input className="text-input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label className="field"><span>Confirm password</span><input className="text-input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        <AuthError msg={err} />
        <button className="btn pri" type="submit" disabled={busy} style={{ height: 40 }}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="cap" style={{ margin: 0, fontSize: 13 }}>Already have an account? <Link href="/login">Sign in</Link></p>
    </AuthCard>
  );
}
