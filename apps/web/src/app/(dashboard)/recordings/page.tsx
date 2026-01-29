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
import { cn } from '@komuchi/ui';

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    label: 'Pending',
    color: 'text-slate-500',
    bgColor: 'bg-slate-100',
  },
  uploaded: {
    icon: Upload,
    label: 'Uploaded',
    color: 'text-blue-500',
    bgColor: 'bg-blue-100',
  },
  processing: {
    icon: Loader2,
    label: 'Processing',
    color: 'text-amber-500',
    bgColor: 'bg-amber-100',
    animate: true,
  },
  complete: {
    icon: CheckCircle,
    label: 'Complete',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-100',
  },
  failed: {
    icon: AlertCircle,
    label: 'Failed',
    color: 'text-red-500',
    bgColor: 'bg-red-100',
  },
};

const MODE_LABELS = {
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
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        config.bgColor,
        config.color
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', 'animate' in config && config.animate && 'animate-spin')} />
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

function RecordingCard({ recording }: { recording: Recording }) {
  return (
    <Link
      href={`/recordings/${recording.id}`}
      className="group block rounded-xl border border-slate-200 bg-white p-5 transition-all hover:border-emerald-500 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 group-hover:bg-emerald-100">
            <FileAudio className="h-6 w-6 text-slate-500 group-hover:text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 group-hover:text-emerald-600">
              {recording.title}
            </h3>
            <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
              <span>{MODE_LABELS[recording.mode]}</span>
              <span>•</span>
              <span>{formatDuration(recording.duration)}</span>
              <span>•</span>
              <span>{formatDate(recording.createdAt)}</span>
            </div>
          </div>
        </div>
        <StatusBadge status={recording.status} />
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white py-16">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
        <FileAudio className="h-8 w-8 text-slate-400" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-slate-900">No recordings yet</h3>
      <p className="mb-6 text-sm text-slate-500">
        Upload your first audio recording to get started
      </p>
      <Link
        href="/recordings/new"
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-white hover:bg-emerald-600"
      >
        <PlusCircle className="h-5 w-5" />
        New Recording
      </Link>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-slate-200 bg-white p-5"
        >
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-lg bg-slate-200" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-48 rounded bg-slate-200" />
              <div className="h-4 w-32 rounded bg-slate-200" />
            </div>
            <div className="h-6 w-24 rounded-full bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RecordingsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useRecordings(page);

  // Auto-refetch if any recording is processing
  const hasProcessing = data?.data.some(
    (r) => r.status === 'processing' || r.status === 'uploaded'
  );

  // Set up polling when there are processing recordings
  if (hasProcessing) {
    setTimeout(() => refetch(), 5000);
  }

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-500" />
        <p className="font-medium text-red-800">Failed to load recordings</p>
        <button
          onClick={() => refetch()}
          className="mt-4 rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
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
        <p className="text-sm text-slate-500">
          {pagination?.total} recording{pagination?.total !== 1 ? 's' : ''}
        </p>
        <Link
          href="/recordings/new"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
        >
          <PlusCircle className="h-4 w-4" />
          New Recording
        </Link>
      </div>

      {/* Recordings list */}
      <div className="space-y-4">
        {recordings.map((recording) => (
          <RecordingCard key={recording.id} recording={recording} />
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <span className="px-4 text-sm text-slate-600">
            Page {page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
