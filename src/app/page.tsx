'use client';
import React, { useRef } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { Mark } from '@/components/Icon';
import { Garden } from '@/components/landing/Garden';

export default function Landing() {
  const { auth, authReady } = useStore();
  const banner = useRef<HTMLDivElement>(null);
  const signedIn = authReady && !!auth;
  return (
    <main className="landing">
      <Garden bannerRef={banner} />
      <header className="landing-top">
        <Link href="/" className="landing-brand" aria-label="Orchive home"><Mark size={26} color="#E9C6F0" /><span>Orchive</span></Link>
      </header>
      <section ref={banner} className="landing-banner" data-banner aria-labelledby="hero-title">
        <h1 id="hero-title">Your universe of reading</h1>
        <p>Bring your library and your notes together. Follow the threads between what you read, think, and discover.</p>
        <div className="landing-actions">
          {signedIn ? (
            <Link href="/library" className="lbtn pri">Open your library</Link>
          ) : (
            <>
              <Link href="/signup" className="lbtn pri">Sign up free</Link>
              <Link href="/login" className="lbtn sec">Sign in</Link>
            </>
          )}
        </div>
      </section>
      <p className="landing-hint" aria-hidden="true">Move through the garden · tap to scatter petals</p>
    </main>
  );
}
