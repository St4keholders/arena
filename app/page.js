'use client';
import dynamic from 'next/dynamic';

const HostApp = dynamic(() => import('../components/HostApp'), { ssr: false });

export default function Page() {
  return <HostApp />;
}
