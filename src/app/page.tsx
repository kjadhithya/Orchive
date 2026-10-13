'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { Mark } from '@/components/Icon';

export default function Home() {
  const { auth, authReady } = useStore();
  const router = useRouter();
  useEffect(() => {
    if (!authReady) return;
    router.replace(auth ? '/library' : '/login');
  }, [auth, authReady, router]);
  return <div style={{ height: '100dvh', display: 'grid', placeItems: 'center' }}><Mark size={40} title="Orchive" /></div>;
}
