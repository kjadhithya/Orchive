'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { sb } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { AuthCard, AuthError } from '@/components/AuthCard';

export default function Login() {
  const router = useRouter();
  const { auth } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (auth) router.replace('/library'); }, [auth, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await sb().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setErr(error.message === 'Invalid login credentials' ? 'That email and password don’t match an account.' : error.message);
    else router.replace('/library');
  };

  return (
    <AuthCard title="Sign in" sub="Your library, notes and reading positions, on every device.">
      <form onSubmit={submit} className="col" style={{ gap: 12 }}>
        <label className="field"><span>Email</span><input className="text-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Password</span><input className="text-input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <AuthError msg={err} />
        <button className="btn pri" type="submit" disabled={busy} style={{ height: 40 }}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
        <Link href="/forgot">Forgot password?</Link>
        <Link href="/signup">Create an account</Link>
      </div>
    </AuthCard>
  );
}
