'use client';
import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { Mark } from '@/components/Icon';
import { Garden } from '@/components/landing/Garden';

export default function Landing() {
  const { auth, authReady } = useStore();
  const banner = useRef<HTMLDivElement>(null);
  const signedIn = authReady && !!auth;
  const router = useRouter();
  // the landing is the front door for visitors; signed-in readers go straight to their library
  useEffect(() => { if (signedIn) router.replace('/library'); }, [signedIn, router]);
  return (
    <main className="landing">
      <Garden bannerRef={banner} />
      <header className="landing-top">
        <Link href="/" className="landing-brand" aria-label="Orchive home"><Mark size={26} color="#E9C6F0" /><span>Orchive</span></Link>
        <nav className="landing-nav" aria-label="Account">
          {signedIn ? (
            <Link href="/library" className="lbtn pri">Open your library</Link>
          ) : (
            <>
              <Link href="/login" className="lbtn ghost">Sign in</Link>
              <Link href="/signup" className="lbtn pri">Sign up</Link>
            </>
          )}
        </nav>
      </header>
      <section ref={banner} className="landing-banner" aria-labelledby="hero-title">
        <h1 id="hero-title">Your universe of reading</h1>
        <p>Bring your library and your notes together. Follow the threads between what you read, think, and discover.</p>
      </section>
    </main>
  );
}
