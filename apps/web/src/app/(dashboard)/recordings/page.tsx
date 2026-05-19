'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FileAudio,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Upload,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
} from 'lucide-react';
import { useRecordings } from '@/hooks/use-recordings';
import type { Recording } from '@/lib/api';
import { cn } from '@twin/ui';

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    label: 'Pending',
    color: 'text-slate-300',
    bgColor: 'bg-slate-500/20',
    dotColor: 'bg-slate-400',
  },
  uploaded: {
    icon: Upload,
    label: 'Uploaded',
    color: 'text-blue-300',
    bgColor: 'bg-blue-500/20',
    dotColor: 'bg-blue-400',
  },
  processing: {
    icon: Loader2,
    label: 'Processing',
    color: 'text-amber-300',
    bgColor: 'bg-amber-500/20',
    dotColor: 'bg-amber-400',
    animate: true,
  },
  complete: {
    icon: CheckCircle,
    label: 'Complete',
    color: 'text-emerald-300',
    bgColor: 'bg-emerald-500/20',
    dotColor: 'bg-emerald-400',
  },
  failed: {
    icon: AlertCircle,
    label: 'Failed',
    color: 'text-red-300',
    bgColor: 'bg-red-500/20',
    dotColor: 'bg-red-400',
  },
};

const MODE_LABELS: Record<string, string> = {
  general: 'General',
  meeting: 'Meeting',
  sales: 'Sales Call',
  interview: 'Interview',
};

function StatusBadge({ status }: { status: Recording['status'] }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur-sm',
        config.bgColor,
        config.color
      )}
    >
      <Icon
        className={cn('h-3.5 w-3.5', 'animate' in config && config.animate && 'animate-spin')}
      />
      {config.label}
    </span>
  );
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function RecordingCard({ recording, index }: { recording: Recording; index: number }) {
  const statusConfig = STATUS_CONFIG[recording.status];

  return (
    <Link
      href={`/recordings/${recording.id}`}
      className="animate-fadeIn group relative block rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md transition-all duration-300 hover:translate-y-[-2px] hover:border-white/20 hover:bg-white/10 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'both' }}
    >
      {/* Status dot glow */}
      <div
        className={cn(
          'absolute right-4 top-4 h-2.5 w-2.5 rounded-full',
          statusConfig.dotColor,
          'animate' in statusConfig && statusConfig.animate && 'animate-pulse'
        )}
      />

      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 transition-colors group-hover:bg-emerald-500/20">
          <FileAudio className="h-6 w-6 text-slate-300 transition-colors group-hover:text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-white transition-colors group-hover:text-emerald-400">
            {recording.title}
          </h3>
          <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-400">
            <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs font-medium text-slate-300">
              {MODE_LABELS[recording.mode] || recording.mode}
            </span>
            <span>{formatDuration(recording.duration)}</span>
            <span className="text-white/20">|</span>
            <span>{formatDate(recording.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <StatusBadge status={recording.status} />
        <span className="text-xs text-slate-500 transition-colors group-hover:text-slate-300">
          View details &rarr;
        </span>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5 py-16 backdrop-blur-md">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
        <FileAudio className="h-8 w-8 text-slate-400" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-white">No recordings yet</h3>
      <p className="mb-6 text-sm text-slate-400">
        Upload your first audio recording to get started
      </p>
      <Link
        href="/recordings/new"
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-white transition-all duration-200 hover:scale-[1.02] hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
      >
        <PlusCircle className="h-5 w-5" />
        New Recording
      </Link>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md"
        >
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-3/4 rounded bg-white/10" />
              <div className="h-4 w-1/2 rounded bg-white/10" />
            </div>
          </div>
          <div className="mt-4 h-6 w-24 rounded-full bg-white/10" />
        </div>
      ))}
    </div>
  );
}

export default function RecordingsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useRecordings(page);

  const hasProcessing = data?.data.some(
    (r) => r.status === 'processing' || r.status === 'uploaded'
  );

  if (hasProcessing) {
    setTimeout(() => refetch(), 5000);
  }

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center backdrop-blur-md">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
        <p className="font-medium text-red-300">Failed to load recordings</p>
        <button
          onClick={() => refetch()}
          className="mt-4 rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/30"
        >
          Try Again
        </button>
      </div>
    );
  }

  const recordings = data?.data || [];
  const pagination = data?.pagination;

  if (recordings.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6">
      {/* Header with count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          {pagination?.total} recording{pagination?.total !== 1 ? 's' : ''}
        </p>
        <Link
          href="/recordings/new"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02] hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
        >
          <PlusCircle className="h-4 w-4" />
          New Recording
        </Link>
      </div>

      {/* Recordings grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {recordings.map((recording, index) => (
          <RecordingCard key={recording.id} recording={recording} index={index} />
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <span className="px-4 text-sm text-slate-400">
            Page {page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
