'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Mic,
  List,
  PlusCircle,
  LogOut,
  User,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@komuchi/ui';

const navigation = [
  { name: 'Recordings', href: '/recordings', icon: List },
  { name: 'Record', href: '/recordings/record', icon: Mic },
  { name: 'New Recording', href: '/recordings/new', icon: PlusCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="flex h-full w-64 flex-col bg-slate-900">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500">
          <Mic className="h-5 w-5 text-white" />
        </div>
        <span className="text-xl font-bold text-white">Komuchi</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-slate-800 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700">
            <User className="h-5 w-5 text-slate-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {user?.email || 'Guest'}
            </p>
            <p className="text-xs text-slate-500">Demo User</p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
