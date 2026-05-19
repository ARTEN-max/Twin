'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mic,
  Square,
  Pause,
  Play,
  RefreshCw,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@twin/ui';
import {
  formatTimer,
  getExtensionForMime,
  normalizeMimeType,
  useMediaRecorder,
} from '@/hooks/use-media-recorder';
import { uploadToPresignedUrl } from '@/lib/upload';
import { completeUpload, createRecording } from '@/lib/api';
import { useUserId } from '@/lib/auth';

const MODES = [
  { value: 'general', label: 'General', description: 'General conversation or discussion' },
  { value: 'meeting', label: 'Meeting', description: 'Team meetings and standups' },
  { value: 'sales', label: 'Sales Call', description: 'Sales conversations and demos' },
  { value: 'interview', label: 'Interview', description: 'Job interviews and screenings' },
];

type Step = 'idle' | 'uploading' | 'complete' | 'error';

function sanitizeFilename(name: string): string {
  return (
    name
      .trim()
      .replace(/[^\w\s.-]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'recording'
  );
}

export default function RecordPage() {
  const router = useRouter();
  const userId = useUserId();
  const [rec, controls] = useMediaRecorder();

  const isSecureContext = typeof window === 'undefined' ? true : window.isSecureContext;

  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('general');
  const [step, setStep] = useState<Step>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadCtx, setUploadCtx] = useState<{
    recordingId: string;
    uploadUrl: string;
    fileSize: number;
  } | null>(null);

  const canEditMeta = rec.status === 'idle' || rec.status === 'stopped' || rec.status === 'error';
  const canStart = rec.status === 'idle' && step === 'idle';
  const canPause = rec.status === 'recording' && step === 'idle';
  const canResume = rec.status === 'paused' && step === 'idle';
  const canStop = (rec.status === 'recording' || rec.status === 'paused') && step === 'idle';

  const baseMime = useMemo(
    () => (rec.mimeType ? normalizeMimeType(rec.mimeType) : null),
    [rec.mimeType]
  );

  const canUpload =
    rec.status === 'stopped' && !!rec.blob && !!baseMime && !!title && step === 'idle';

  const startRecording = async () => {
    setError(null);
    await controls.start();
  };

  const resetAll = () => {
    setError(null);
    setStep('idle');
    setUploadProgress(0);
    setUploadCtx(null);
    controls.reset();
  };

  const uploadRecording = async () => {
    if (!rec.blob || !baseMime) return;
    if (!title.trim()) {
      setError('Please set a title before uploading.');
      return;
    }

    setStep('uploading');
    setError(null);
    setUploadProgress(0);

    try {
      const ext = getExtensionForMime(baseMime);
      const filename = `${sanitizeFilename(title)}.${ext}`;
      const file = new File([rec.blob], filename, { type: baseMime });

      let recordingId = uploadCtx?.recordingId;
      let uploadUrl = uploadCtx?.uploadUrl;
      if (!recordingId || !uploadUrl) {
        const created = await createRecording(userId, {
          title: title.trim(),
          mode,
          mimeType: file.type,
        });
        recordingId = created.recordingId;
        uploadUrl = created.uploadUrl;
        setUploadCtx({ recordingId, uploadUrl, fileSize: file.size });
      }

      const up = await uploadToPresignedUrl(file, uploadUrl, {
        contentType: file.type,
        maxRetries: 3,
        onProgress: (p) => {
          if (typeof p.percent === 'number') setUploadProgress(p.percent);
        },
      });
      if (!up.ok) {
        if (up.status === 403 || up.status === 400) {
          setUploadCtx(null);
        }
        throw new Error(up.message);
      }

      await completeUpload(userId, recordingId, file.size);

      setStep('complete');
      setTimeout(() => router.push(`/recordings/${recordingId}`), 500);
    } catch (e) {
      setStep('error');
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  return (
    <div className="animate-fadeIn mx-auto max-w-2xl space-y-8">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <h1 className="text-xl font-bold text-white">Record</h1>
        <p className="mt-1 text-sm text-slate-400">
          Record from your microphone, then upload and process after you stop.
        </p>
      </div>

      {/* Metadata */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-white">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Porsche Macan discussion"
              disabled={!canEditMeta || step !== 'idle'}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-white">Mode</p>
            <div className="grid grid-cols-2 gap-3">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  disabled={!canEditMeta || step !== 'idle'}
                  className={cn(
                    'rounded-xl border-2 p-4 text-left transition-all duration-200 disabled:opacity-60',
                    mode === m.value
                      ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                  )}
                >
                  <p
                    className={cn(
                      'font-medium',
                      mode === m.value ? 'text-emerald-400' : 'text-white'
                    )}
                  >
                    {m.label}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{m.description}</p>
                </button>
              ))}
            </div>
          </div>

          {!isSecureContext && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-300">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 text-amber-400" />
                <div>
                  <p className="font-medium">Microphone requires a secure context</p>
                  <p className="mt-1 text-amber-400/80">
                    Use <span className="font-mono">http://localhost:3000</span> in dev, or HTTPS in
                    production. If you&apos;re opening the app via a LAN IP (e.g.{' '}
                    <span className="font-mono">http://192.168&hellip;</span>), some browsers will
                    block mic access.
                  </p>
                </div>
              </div>
            </div>
          )}

          {rec.permission === 'denied' && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 text-red-400" />
                <div>
                  <p className="font-medium">Microphone permission denied</p>
                  <p className="mt-1 text-red-400/80">
                    Allow mic access for this site, then click &quot;Try again&quot;.
                  </p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-red-400/80">
                    <li>
                      <span className="font-medium text-red-300">Chrome/Edge/Brave</span>: click the
                      lock icon in the address bar &rarr; Site settings &rarr; Microphone &rarr;
                      Allow.
                    </li>
                    <li>
                      <span className="font-medium text-red-300">Safari</span>: Safari &rarr;
                      Settings for This Website &rarr; Microphone &rarr; Allow.
                    </li>
                    <li>
                      <span className="font-medium text-red-300">macOS</span>: System Settings
                      &rarr; Privacy &amp; Security &rarr; Microphone &rarr; enable your browser.
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={step !== 'idle'}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/30 disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Try again
                  </button>
                </div>
              </div>
            </div>
          )}

          {rec.error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 text-red-400" />
                <div>
                  <p className="font-medium">Recording error</p>
                  <p className="mt-1 text-red-400/80">{rec.error}</p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 text-red-400" />
                <div>
                  <p className="font-medium">Upload error</p>
                  <p className="mt-1 text-red-400/80">{error}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recorder */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Recorder</p>
            <p className="mt-1 text-sm text-slate-400">
              {rec.mimeType ? `Format: ${normalizeMimeType(rec.mimeType)}` : 'Format: unsupported'}
            </p>
          </div>
          <div
            className={cn(
              'rounded-lg px-3 py-1.5 font-mono text-sm',
              rec.status === 'recording'
                ? 'animate-pulse bg-red-500/20 text-red-300'
                : 'bg-white/10 text-slate-300'
            )}
          >
            {formatTimer(rec.elapsedMs)}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={startRecording}
            disabled={!canStart || !title.trim() || rec.permission === 'denied'}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02] hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            <Mic className="h-4 w-4" />
            Start
          </button>

          <button
            type="button"
            onClick={controls.pause}
            disabled={!canPause}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pause className="h-4 w-4" />
            Pause
          </button>

          <button
            type="button"
            onClick={controls.resume}
            disabled={!canResume}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            Resume
          </button>

          <button
            type="button"
            onClick={controls.stop}
            disabled={!canStop}
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Square className="h-4 w-4" />
            Stop
          </button>

          <button
            type="button"
            onClick={resetAll}
            disabled={(rec.status === 'idle' && !rec.blob) || step === 'uploading'}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Reset
          </button>
        </div>

        {rec.audioUrl && rec.status === 'stopped' && (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="mb-2 text-sm font-semibold text-white">Preview</p>
            <audio controls src={rec.audioUrl} className="w-full" />
            <p className="mt-2 text-xs text-slate-500">Your audio stays local until you upload.</p>
          </div>
        )}
      </div>

      {/* Upload */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white">Post-record processing</p>
            <p className="mt-1 text-sm text-slate-400">
              After upload, transcription/debrief runs in the background.
            </p>
          </div>
          <button
            type="button"
            onClick={uploadRecording}
            disabled={!canUpload}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02] hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {step === 'uploading' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Upload & Process
          </button>
        </div>

        {step === 'uploading' && (
          <div className="mt-4 space-y-3">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-sm text-slate-400">{uploadProgress}% uploaded</p>
          </div>
        )}

        {step === 'complete' && (
          <div className="mt-4 flex items-center gap-2 text-emerald-400">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Uploaded! Opening details&hellip;</span>
          </div>
        )}

        {step === 'error' && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setStep('idle');
                setError(null);
                setUploadProgress(0);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
            >
              <RefreshCw className="h-4 w-4" />
              Retry upload
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              Reset recording
            </button>
            <p className="text-xs text-slate-500">
              If the presigned URL expired, Retry will generate a new upload URL automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
