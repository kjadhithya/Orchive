'use client';
import React from 'react';
import Link from 'next/link';
import { Mark } from './Icon';

export function AuthCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--canvas)', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Link href="/" className="row" style={{ gap: 10, textDecoration: 'none', alignSelf: 'flex-start' }} aria-label="Orchive home">
          <Mark size={30} />
          <span className="serif" style={{ fontSize: 22, color: 'var(--primary)' }}>Orchive</span>
        </Link>
        <div>
          <h1 className="serif" style={{ fontSize: 26, lineHeight: '32px' }}>{title}</h1>
          {sub && <p className="secondary" style={{ margin: '6px 0 0' }}>{sub}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}

export function AuthError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: 13 }}>{msg}</p>;
}
