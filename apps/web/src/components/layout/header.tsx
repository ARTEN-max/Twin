'use client';

import { usePathname } from 'next/navigation';

const pageTitles: Record<string, string> = {
  '/recordings': 'Recordings',
  '/recordings/new': 'New Recording',
  '/recordings/record': 'Record',
  '/voice-profile': 'Voice Profile',
};

export function Header() {
  const pathname = usePathname();

  let title = pageTitles[pathname];

  if (!title && pathname.startsWith('/recordings/')) {
    title = 'Recording Details';
  }

  return (
    <header className="flex h-16 items-center border-b border-white/10 bg-white/5 px-6 backdrop-blur-xl">
      <h1 className="bg-gradient-to-r from-white to-slate-300 bg-clip-text text-xl font-semibold text-transparent">
        {title || 'Twin'}
      </h1>
    </header>
  );
}
