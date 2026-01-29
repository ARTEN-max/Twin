'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import {
  ArrowLeft,
  FileAudio,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Download,
  Copy,
  RefreshCw,
  FileText,
  LayoutList,
} from 'lucide-react';
import {
  useRecordingWithBackoffPolling,
  useRecordingJobsWithBackoffPolling,
  useRetryDebrief,
  useRetryTranscription,
} from '@/hooks/use-recordings';
import { getDownloadUrl } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { cn } from '@komuchi/ui';

type Tab = 'debrief' | 'transcript';

const STATUS_CONFIG: Record<string, { icon: typeof Clock; label: string; color: string; animate?: boolean }> = {
  pending: { icon: Clock, label: 'Waiting', color: 'text-slate-500' },
  uploaded: { icon: Clock, label: 'Uploaded', color: 'text-blue-500' },
  processing: { icon: Loader2, label: 'Processing', color: 'text-amber-500', animate: true },
  running: { icon: Loader2, label: 'Running', color: 'text-amber-500', animate: true },
  complete: { icon: CheckCircle, label: 'Complete', color: 'text-emerald-500' },
  failed: { icon: AlertCircle, label: 'Failed', color: 'text-red-500' },
};

const MODE_LABELS = {
  general: 'General',
  meeting: 'Meeting',
  sales: 'Sales Call',
  interview: 'Interview',
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ProcessingStatus() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16">
      <div className="relative mb-6">
        <div className="h-16 w-16 rounded-full border-4 border-slate-200" />
        <div className="absolute inset-0 h-16 w-16 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-slate-900">Processing your recording</h3>
      <p className="text-sm text-slate-500">
        Transcribing audio and generating debrief...
      </p>
    </div>
  );
}

type StepState = 'pending' | 'current' | 'complete' | 'failed';

function getStepIcon(state: StepState) {
  if (state === 'complete') return CheckCircle;
  if (state === 'failed') return AlertCircle;
  if (state === 'current') return Loader2;
  return Clock;
}

function stepClasses(state: StepState) {
  if (state === 'complete') return { dot: 'bg-emerald-500', text: 'text-emerald-700', ring: 'ring-emerald-100' };
  if (state === 'failed') return { dot: 'bg-red-500', text: 'text-red-700', ring: 'ring-red-100' };
  if (state === 'current') return { dot: 'bg-amber-500', text: 'text-amber-700', ring: 'ring-amber-100' };
  return { dot: 'bg-slate-300', text: 'text-slate-600', ring: 'ring-slate-100' };
}

function deriveTimeline(params: {
  recordingStatus: string;
  hasTranscript: boolean;
  hasDebrief: boolean;
  jobs?: Array<{ type: 'TRANSCRIBE' | 'DEBRIEF'; status: string }>;
}): Array<{ key: string; title: string; state: StepState; subtitle?: string }> {
  const { recordingStatus, hasTranscript, hasDebrief, jobs } = params;
  const transcribeJobs = (jobs ?? []).filter((j) => j.type === 'TRANSCRIBE');
  const debriefJobs = (jobs ?? []).filter((j) => j.type === 'DEBRIEF');

  const any = (arr: Array<{ status: string }>, pred: (s: string) => boolean) =>
    arr.some((j) => pred(j.status));

  const transcribeFailed = any(transcribeJobs, (s) => s === 'failed') && !hasTranscript;
  const transcribeDone = hasTranscript || any(transcribeJobs, (s) => s === 'complete');
  const transcribeActive = any(transcribeJobs, (s) => s === 'pending' || s === 'running') || recordingStatus === 'processing';

  const debriefFailed = any(debriefJobs, (s) => s === 'failed') && !hasDebrief;
  const debriefDone = hasDebrief || any(debriefJobs, (s) => s === 'complete');
  const debriefActive =
    any(debriefJobs, (s) => s === 'pending' || s === 'running') ||
    (transcribeDone && (recordingStatus === 'processing' || recordingStatus === 'uploaded'));

  const uploadedState: StepState =
    recordingStatus === 'pending' ? 'pending' : recordingStatus === 'failed' && !transcribeDone && !hasTranscript ? 'failed' : 'complete';

  const transcribingState: StepState = transcribeFailed
    ? 'failed'
    : transcribeDone
      ? 'complete'
      : transcribeActive || uploadedState === 'complete'
        ? 'current'
        : 'pending';

  const debriefingState: StepState = debriefFailed
    ? 'failed'
    : debriefDone
      ? 'complete'
      : debriefActive
        ? 'current'
        : 'pending';

  const completeState: StepState =
    recordingStatus === 'complete' && hasDebrief
      ? 'complete'
      : recordingStatus === 'failed' && !hasDebrief
        ? 'failed'
        : debriefingState === 'complete'
          ? 'current'
          : 'pending';

  return [
    { key: 'uploaded', title: 'Uploaded', state: uploadedState },
    { key: 'transcribing', title: 'Transcribing', state: transcribingState },
    { key: 'debriefing', title: 'Debriefing', state: debriefingState },
    { key: 'complete', title: 'Complete', state: completeState },
  ];
}

function ProcessingTimeline({
  timeline,
}: {
  timeline: Array<{ key: string; title: string; state: StepState; subtitle?: string }>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="mb-4 text-sm font-semibold text-slate-900">Processing steps</h3>
      <ol className="space-y-4">
        {timeline.map((step, idx) => {
          const Icon = getStepIcon(step.state);
          const cls = stepClasses(step.state);
          const isLast = idx === timeline.length - 1;
          return (
            <li key={step.key} className="relative flex gap-3">
              <div className="relative">
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-full ring-8', cls.dot, cls.ring)}>
                  <Icon className={cn('h-4 w-4 text-white', step.state === 'current' && 'animate-spin')} />
                </div>
                {!isLast && <div className="absolute left-1/2 top-8 h-6 w-px -translate-x-1/2 bg-slate-200" />}
              </div>
              <div className="pt-1">
                <p className={cn('text-sm font-semibold', cls.text)}>{step.title}</p>
                {step.subtitle ? <p className="text-xs text-slate-500">{step.subtitle}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TranscriptView({ text, segments }: { text: string; segments?: Array<{ start: number; end: number; text: string; speaker?: string }> | null }) {
  if (segments && segments.length > 0) {
    return (
      <div className="space-y-4">
        {segments.map((segment, idx) => (
          <div key={idx} className="group rounded-lg p-3 hover:bg-slate-50">
            <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">
                {Math.floor(segment.start / 60)}:{(segment.start % 60).toFixed(0).padStart(2, '0')}
              </span>
              {segment.speaker && (
                <>
                  <span>•</span>
                  <span className="font-medium text-slate-700">{segment.speaker}</span>
                </>
              )}
            </div>
            <p className="text-slate-700">{segment.text}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">
      {text}
    </div>
  );
}

function DebriefView({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-li:text-slate-700 prose-strong:text-slate-900">
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  );
}

export default function RecordingDetailPage() {
  const params = useParams();
  const recordingId = params.id as string;
  const userId = useUserId();
  const [activeTab, setActiveTab] = useState<Tab>('debrief');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copyLabel, setCopyLabel] = useState<string>('Copy debrief');

  const { data: recording, isLoading, isError } = useRecordingWithBackoffPolling(recordingId);
  const { data: jobs } = useRecordingJobsWithBackoffPolling(recordingId);
  const retryDebrief = useRetryDebrief();
  const retryTranscription = useRetryTranscription();

  // Derive status/timeline in a hook-safe way (must run on every render, even while loading).
  const hasFailedJob = jobs?.some((job) => job.status === 'failed') ?? false;
  const hasTranscript = !!recording?.transcript;
  const hasDebrief = !!recording?.debrief;
  const isMockTranscript =
    recording?.transcript?.text?.trim() === 'This is a mock transcription result.';

  const effectiveStatus =
    recording?.status ? (hasFailedJob && !hasDebrief ? 'failed' : recording.status) : 'pending';

  const timeline = useMemo(
    () =>
      deriveTimeline({
        recordingStatus: effectiveStatus,
        hasTranscript,
        hasDebrief,
        jobs: jobs?.map((j) => ({ type: j.type, status: j.status })),
      }),
    [effectiveStatus, hasDebrief, hasTranscript, jobs]
  );

  const handleDownloadAudio = async () => {
    if (!recording) return;
    setIsDownloading(true);
    try {
      const { downloadUrl, filename } = await getDownloadUrl(userId, recordingId);
      // Open in new tab or trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename || 'recording';
      link.click();
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadTranscript = () => {
    if (!recording?.transcript?.text) return;
    const title = (recording.title || 'transcript').replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').slice(0, 80);
    const filename = `${title || 'transcript'}.txt`;

    const blob = new Blob([recording.transcript.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyDebrief = async () => {
    const text = recording?.debrief?.markdown;
    if (!text) return;
    setIsCopying(true);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // fallback
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy debrief'), 1500);
    } catch (e) {
      console.error('Copy failed:', e);
      setCopyLabel('Copy failed');
      setTimeout(() => setCopyLabel('Copy debrief'), 1500);
    } finally {
      setIsCopying(false);
    }
  };

  const handleRetryDebrief = () => {
    retryDebrief.mutate(recordingId);
  };

  const handleRetryTranscription = () => {
    retryTranscription.mutate(recordingId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (isError || !recording) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-500" />
        <p className="font-medium text-red-800">Failed to load recording</p>
        <Link
          href="/recordings"
          className="mt-4 inline-flex items-center gap-2 text-sm text-red-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to recordings
        </Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;
  const isProcessing = (effectiveStatus === 'processing' || effectiveStatus === 'uploaded') && !hasFailedJob;
  const isComplete = effectiveStatus === 'complete';
  const isFailed = effectiveStatus === 'failed' || hasFailedJob;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/recordings"
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to recordings
      </Link>

      {/* Header Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-100">
              <FileAudio className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{recording.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium">
                  {MODE_LABELS[recording.mode]}
                </span>
                <span>{formatDuration(recording.duration)}</span>
                <span>•</span>
                <span>{formatDate(recording.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status badge */}
            <span className={cn('flex items-center gap-1.5 text-sm font-medium', statusConfig.color)}>
              <StatusIcon className={cn('h-4 w-4', statusConfig.animate && 'animate-spin')} />
              {statusConfig.label}
            </span>

            <div className="flex items-center gap-2">
              {/* Copy Debrief */}
              <button
                onClick={handleCopyDebrief}
                disabled={!recording.debrief?.markdown || isCopying}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                title="Copy debrief markdown to clipboard"
              >
                {isCopying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                {copyLabel}
              </button>

              {/* Download transcript */}
              <button
                onClick={handleDownloadTranscript}
                disabled={!recording.transcript?.text}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                title="Download transcript as .txt"
              >
                <FileText className="h-4 w-4" />
                Download transcript
              </button>

              {/* Download audio (optional) */}
              {recording.objectKey && (
                <button
                  onClick={handleDownloadAudio}
                  disabled={isDownloading}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  title="Download original audio"
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Audio
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Processing timeline */}
        <div className="mt-6">
          <ProcessingTimeline timeline={timeline} />
        </div>
      </div>

      {/* Processing state */}
      {isProcessing && <ProcessingStatus />}

      {/* Failed state */}
      {isFailed && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-500" />
          <p className="font-medium text-red-800">
            {hasTranscript && !hasDebrief ? 'Debrief generation failed' : 'Processing failed'}
          </p>
          <p className="mt-1 text-sm text-red-600">
            {hasTranscript && !hasDebrief
              ? 'The transcript was saved successfully, but debrief generation encountered an error.'
              : 'There was an error processing this recording.'}
          </p>
          {hasTranscript && !hasDebrief && (
            <button
              onClick={handleRetryDebrief}
              disabled={retryDebrief.isPending}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
            >
              <RefreshCw className={cn('h-4 w-4', retryDebrief.isPending && 'animate-spin')} />
              Retry Debrief Generation
            </button>
          )}

          {(isMockTranscript || !hasTranscript) && recording.objectKey && (
            <button
              onClick={handleRetryTranscription}
              disabled={retryTranscription.isPending}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', retryTranscription.isPending && 'animate-spin')} />
              Retry Transcription (regenerates debrief)
            </button>
          )}
        </div>
      )}

      {/* Content tabs - show if we have transcript or debrief, even if failed */}
      {(isComplete || hasTranscript || hasDebrief) && (recording.transcript || recording.debrief) && (
        <div className="rounded-xl border border-slate-200 bg-white">
          {/* Tab headers */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('debrief')}
              className={cn(
                'flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors',
                activeTab === 'debrief'
                  ? 'border-b-2 border-emerald-500 text-emerald-600'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <LayoutList className="h-4 w-4" />
              Debrief
            </button>
            <button
              onClick={() => setActiveTab('transcript')}
              className={cn(
                'flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors',
                activeTab === 'transcript'
                  ? 'border-b-2 border-emerald-500 text-emerald-600'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <FileText className="h-4 w-4" />
              Transcript
            </button>
          </div>

          {/* Tab content */}
          <div className="p-6">
            {activeTab === 'debrief' && recording.debrief && (
              <DebriefView markdown={recording.debrief.markdown} />
            )}
            {activeTab === 'debrief' && !recording.debrief && (
              <p className="text-slate-500">No debrief available yet.</p>
            )}
            {activeTab === 'transcript' && recording.transcript && (
              <TranscriptView
                text={recording.transcript.text}
                segments={recording.transcript.segments}
              />
            )}
            {activeTab === 'transcript' && !recording.transcript && (
              <p className="text-slate-500">No transcript available yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
