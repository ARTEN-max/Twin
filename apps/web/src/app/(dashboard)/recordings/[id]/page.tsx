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
  MessageCircle,
} from 'lucide-react';
import { ChatPanel } from '@/components/chat/chat-panel';
import {
  useRecordingWithBackoffPolling,
  useRecordingJobsWithBackoffPolling,
  useRetryDebrief,
  useRetryTranscription,
} from '@/hooks/use-recordings';
import { getDownloadUrl } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { cn } from '@twin/ui';

type Tab = 'debrief' | 'transcript' | 'chat';

const STATUS_CONFIG: Record<
  string,
  { icon: typeof Clock; label: string; color: string; animate?: boolean }
> = {
  pending: { icon: Clock, label: 'Waiting', color: 'text-slate-400' },
  uploaded: { icon: Clock, label: 'Uploaded', color: 'text-blue-400' },
  processing: { icon: Loader2, label: 'Processing', color: 'text-amber-400', animate: true },
  running: { icon: Loader2, label: 'Running', color: 'text-amber-400', animate: true },
  complete: { icon: CheckCircle, label: 'Complete', color: 'text-emerald-400' },
  failed: { icon: AlertCircle, label: 'Failed', color: 'text-red-400' },
};

const MODE_LABELS: Record<string, string> = {
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-16 backdrop-blur-md">
      <div className="relative mb-6">
        <div className="h-16 w-16 rounded-full border-4 border-white/10" />
        <div className="absolute inset-0 h-16 w-16 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-white">Processing your recording</h3>
      <p className="text-sm text-slate-400">Transcribing audio and generating debrief...</p>
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
  if (state === 'complete')
    return { dot: 'bg-emerald-500', text: 'text-emerald-400', ring: 'ring-emerald-500/20' };
  if (state === 'failed')
    return { dot: 'bg-red-500', text: 'text-red-400', ring: 'ring-red-500/20' };
  if (state === 'current')
    return { dot: 'bg-amber-500', text: 'text-amber-400', ring: 'ring-amber-500/20' };
  return { dot: 'bg-slate-600', text: 'text-slate-400', ring: 'ring-slate-500/20' };
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
  const transcribeActive =
    any(transcribeJobs, (s) => s === 'pending' || s === 'running') ||
    recordingStatus === 'processing';

  const debriefFailed = any(debriefJobs, (s) => s === 'failed') && !hasDebrief;
  const debriefDone = hasDebrief || any(debriefJobs, (s) => s === 'complete');
  const debriefActive =
    any(debriefJobs, (s) => s === 'pending' || s === 'running') ||
    (transcribeDone && (recordingStatus === 'processing' || recordingStatus === 'uploaded'));

  const uploadedState: StepState =
    recordingStatus === 'pending'
      ? 'pending'
      : recordingStatus === 'failed' && !transcribeDone && !hasTranscript
        ? 'failed'
        : 'complete';

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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
      <h3 className="mb-4 text-sm font-semibold text-white">Processing steps</h3>
      <ol className="space-y-4">
        {timeline.map((step, idx) => {
          const Icon = getStepIcon(step.state);
          const cls = stepClasses(step.state);
          const isLast = idx === timeline.length - 1;
          return (
            <li key={step.key} className="relative flex gap-3">
              <div className="relative">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full ring-4',
                    cls.dot,
                    cls.ring
                  )}
                >
                  <Icon
                    className={cn('h-4 w-4 text-white', step.state === 'current' && 'animate-spin')}
                  />
                </div>
                {!isLast && (
                  <div className="absolute left-1/2 top-8 h-6 w-px -translate-x-1/2 bg-white/10" />
                )}
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

function TranscriptView({
  text,
  segments,
}: {
  text: string;
  segments?: Array<{ start: number; end: number; text: string; speaker?: string }> | null;
}) {
  if (segments && segments.length > 0) {
    return (
      <div className="space-y-3">
        {segments.map((segment, idx) => {
          const isYou = segment.speaker?.toLowerCase() === 'you';
          return (
            <div
              key={idx}
              className={cn(
                'rounded-xl p-4 transition-colors',
                isYou
                  ? 'border border-emerald-500/20 bg-emerald-500/10'
                  : 'border border-white/5 bg-white/5 hover:bg-white/10'
              )}
            >
              <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-500">
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-slate-400">
                  {Math.floor(segment.start / 60)}:
                  {(segment.start % 60).toFixed(0).padStart(2, '0')}
                </span>
                {segment.speaker && (
                  <span
                    className={cn('font-medium', isYou ? 'text-emerald-400' : 'text-slate-300')}
                  >
                    {segment.speaker}
                  </span>
                )}
              </div>
              <p className="text-slate-200">{segment.text}</p>
            </div>
          );
        })}
      </div>
    );
  }

  return <div className="whitespace-pre-wrap leading-relaxed text-slate-200">{text}</div>;
}

function DebriefView({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-invert prose-headings:text-white prose-p:text-slate-300 prose-li:text-slate-300 prose-strong:text-white prose-a:text-emerald-400 max-w-none">
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

  const hasFailedJob = jobs?.some((job) => job.status === 'failed') ?? false;
  const hasTranscript = !!recording?.transcript;
  const hasDebrief = !!recording?.debrief;
  const isMockTranscript =
    recording?.transcript?.text?.trim() === 'This is a mock transcription result.';

  const effectiveStatus = recording?.status
    ? hasFailedJob && !hasDebrief
      ? 'failed'
      : recording.status
    : 'pending';

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
    const title = (recording.title || 'transcript')
      .replace(/[^\w\s.-]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 80);
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
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center backdrop-blur-md">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
        <p className="font-medium text-red-300">Failed to load recording</p>
        <Link
          href="/recordings"
          className="mt-4 inline-flex items-center gap-2 text-sm text-red-400 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to recordings
        </Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;
  const isProcessing =
    (effectiveStatus === 'processing' || effectiveStatus === 'uploaded') && !hasFailedJob;
  const isComplete = effectiveStatus === 'complete';
  const isFailed = effectiveStatus === 'failed' || hasFailedJob;

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Back link */}
      <Link
        href="/recordings"
        className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to recordings
      </Link>

      {/* Header Card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/20">
              <FileAudio className="h-7 w-7 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{recording.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-400">
                <span className="rounded-lg bg-white/10 px-2.5 py-0.5 font-medium text-slate-300">
                  {MODE_LABELS[recording.mode] || recording.mode}
                </span>
                <span>{formatDuration(recording.duration)}</span>
                <span className="text-white/20">|</span>
                <span>{formatDate(recording.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status badge */}
            <span
              className={cn('flex items-center gap-1.5 text-sm font-medium', statusConfig.color)}
            >
              <StatusIcon className={cn('h-4 w-4', statusConfig.animate && 'animate-spin')} />
              {statusConfig.label}
            </span>

            <div className="flex items-center gap-2">
              {/* Copy Debrief */}
              <button
                onClick={handleCopyDebrief}
                disabled={!recording.debrief?.markdown || isCopying}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                title="Copy debrief markdown to clipboard"
              >
                {isCopying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copyLabel}
              </button>

              {/* Download transcript */}
              <button
                onClick={handleDownloadTranscript}
                disabled={!recording.transcript?.text}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                title="Download transcript as .txt"
              >
                <FileText className="h-4 w-4" />
                Transcript
              </button>

              {/* Download audio */}
              {recording.objectKey && (
                <button
                  onClick={handleDownloadAudio}
                  disabled={isDownloading}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
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
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center backdrop-blur-md">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="font-medium text-red-300">
            {hasTranscript && !hasDebrief ? 'Debrief generation failed' : 'Processing failed'}
          </p>
          <p className="mt-1 text-sm text-red-400/80">
            {hasTranscript && !hasDebrief
              ? 'The transcript was saved successfully, but debrief generation encountered an error.'
              : 'There was an error processing this recording.'}
          </p>
          {hasTranscript && !hasDebrief && (
            <button
              onClick={handleRetryDebrief}
              disabled={retryDebrief.isPending}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/30"
            >
              <RefreshCw className={cn('h-4 w-4', retryDebrief.isPending && 'animate-spin')} />
              Retry Debrief Generation
            </button>
          )}

          {(isMockTranscript || !hasTranscript) && recording.objectKey && (
            <button
              onClick={handleRetryTranscription}
              disabled={retryTranscription.isPending}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
            >
              <RefreshCw
                className={cn('h-4 w-4', retryTranscription.isPending && 'animate-spin')}
              />
              Retry Transcription (regenerates debrief)
            </button>
          )}
        </div>
      )}

      {/* Content tabs */}
      {(isComplete || hasTranscript || hasDebrief) &&
        (recording.transcript || recording.debrief) && (
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
            {/* Tab headers */}
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setActiveTab('debrief')}
                className={cn(
                  'flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors',
                  activeTab === 'debrief'
                    ? 'border-b-2 border-emerald-500 text-emerald-400'
                    : 'text-slate-400 hover:text-white'
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
                    ? 'border-b-2 border-emerald-500 text-emerald-400'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <FileText className="h-4 w-4" />
                Transcript
              </button>
              {isComplete && (
                <button
                  onClick={() => setActiveTab('chat')}
                  className={cn(
                    'flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors',
                    activeTab === 'chat'
                      ? 'border-b-2 border-emerald-500 text-emerald-400'
                      : 'text-slate-400 hover:text-white'
                  )}
                >
                  <MessageCircle className="h-4 w-4" />
                  Chat
                </button>
              )}
            </div>

            {/* Tab content */}
            <div className={cn('p-6', activeTab === 'chat' && 'min-h-[400px] p-0')}>
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
              {activeTab === 'chat' && isComplete && recordingId && (
                <div className="h-[500px]">
                  <ChatPanel recordingId={recordingId} subtitle={recording.title} />
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
