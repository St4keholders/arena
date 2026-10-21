'use client';
import dynamic from 'next/dynamic';

const ControllerApp = dynamic(() => import('../../components/ControllerApp'), { ssr: false });

export default function MandoPage() {
  return <ControllerApp />;
}
