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
import { cn } from '@komuchi/ui';
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
  return name
    .trim()
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'recording';
}

export default function RecordPage() {
  const router = useRouter();
  const userId = useUserId();
  const [rec, controls] = useMediaRecorder();

  const isSecureContext =
    typeof window === 'undefined' ? true : window.isSecureContext;

  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('general');
  const [step, setStep] = useState<Step>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadCtx, setUploadCtx] = useState<{ recordingId: string; uploadUrl: string; fileSize: number } | null>(
    null
  );

  const canEditMeta = rec.status === 'idle' || rec.status === 'stopped' || rec.status === 'error';
  const canStart = rec.status === 'idle' && step === 'idle';
  const canPause = rec.status === 'recording' && step === 'idle';
  const canResume = rec.status === 'paused' && step === 'idle';
  const canStop = (rec.status === 'recording' || rec.status === 'paused') && step === 'idle';

  const baseMime = useMemo(() => (rec.mimeType ? normalizeMimeType(rec.mimeType) : null), [rec.mimeType]);

  const canUpload = rec.status === 'stopped' && !!rec.blob && !!baseMime && !!title && step === 'idle';

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
      // Ensure server-accepted mime type (no codecs params)
      const file = new File([rec.blob], filename, { type: baseMime });

      // Step 1: create recording + get presigned URL (reuse if we already created it)
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

      // Step 2: upload to presigned URL with retries + progress
      const up = await uploadToPresignedUrl(file, uploadUrl, {
        contentType: file.type,
        maxRetries: 3,
        onProgress: (p) => {
          if (typeof p.percent === 'number') setUploadProgress(p.percent);
        },
      });
      if (!up.ok) {
        // Presigned URLs can expire or be invalid; allow user to retry by recreating recording
        if (up.status === 403 || up.status === 400) {
          setUploadCtx(null);
        }
        throw new Error(up.message);
      }

      // Step 3: complete upload to enqueue processing
      await completeUpload(userId, recordingId, file.size);

      setStep('complete');
      setTimeout(() => router.push(`/recordings/${recordingId}`), 500);
    } catch (e) {
      setStep('error');
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-bold text-slate-900">Record</h1>
        <p className="mt-1 text-sm text-slate-500">
          Record from your microphone, then upload and process after you stop.
        </p>
      </div>

      {/* Metadata */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-900">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Porsche Macan discussion"
              disabled={!canEditMeta || step !== 'idle'}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-900">Mode</p>
            <div className="grid grid-cols-2 gap-3">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  disabled={!canEditMeta || step !== 'idle'}
                  className={cn(
                    'rounded-lg border-2 p-4 text-left transition-colors disabled:opacity-60',
                    mode === m.value
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <p className="font-medium text-slate-900">{m.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{m.description}</p>
                </button>
              ))}
            </div>
          </div>

          {!isSecureContext && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
                <div>
                  <p className="font-medium">Microphone requires a secure context</p>
                  <p className="mt-1 text-amber-700">
                    Use <span className="font-mono">http://localhost:3000</span> in dev, or HTTPS in production.
                    If you’re opening the app via a LAN IP (e.g. <span className="font-mono">http://192.168…</span>),
                    some browsers will block mic access.
                  </p>
                </div>
              </div>
            </div>
          )}

          {rec.permission === 'denied' && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-medium">Microphone permission denied</p>
                  <p className="mt-1 text-red-600">
                    Allow mic access for this site, then click “Try again”.
                  </p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-red-600">
                    <li>
                      <span className="font-medium">Chrome/Edge/Brave</span>: click the lock icon in the address bar →
                      Site settings → Microphone → Allow.
                    </li>
                    <li>
                      <span className="font-medium">Safari</span>: Safari → Settings for This Website → Microphone →
                      Allow.
                    </li>
                    <li>
                      <span className="font-medium">macOS</span>: System Settings → Privacy &amp; Security → Microphone →
                      enable your browser.
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={step !== 'idle'}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Try again
                  </button>
                </div>
              </div>
            </div>
          )}

          {rec.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-medium">Recording error</p>
                  <p className="mt-1 text-red-600">{rec.error}</p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-medium">Upload error</p>
                  <p className="mt-1 text-red-600">{error}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recorder */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Recorder</p>
            <p className="mt-1 text-sm text-slate-500">
              {rec.mimeType ? `Format: ${normalizeMimeType(rec.mimeType)}` : 'Format: unsupported'}
            </p>
          </div>
          <div className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-sm text-slate-700">
            {formatTimer(rec.elapsedMs)}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={startRecording}
            disabled={!canStart || !title.trim() || rec.permission === 'denied'}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <Mic className="h-4 w-4" />
            Start
          </button>

          <button
            type="button"
            onClick={controls.pause}
            disabled={!canPause}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pause className="h-4 w-4" />
            Pause
          </button>

          <button
            type="button"
            onClick={controls.resume}
            disabled={!canResume}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            Resume
          </button>

          <button
            type="button"
            onClick={controls.stop}
            disabled={!canStop}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Square className="h-4 w-4" />
            Stop
          </button>

          <button
            type="button"
            onClick={resetAll}
            disabled={(rec.status === 'idle' && !rec.blob) || step === 'uploading'}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Reset
          </button>
        </div>

        {rec.audioUrl && rec.status === 'stopped' && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-sm font-semibold text-slate-900">Preview</p>
            <audio controls src={rec.audioUrl} className="w-full" />
            <p className="mt-2 text-xs text-slate-500">
              Your audio stays local until you upload.
            </p>
          </div>
        )}
      </div>

      {/* Upload */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Post‑record processing</p>
            <p className="mt-1 text-sm text-slate-500">
              After upload, transcription/debrief runs in the background.
            </p>
          </div>
          <button
            type="button"
            onClick={uploadRecording}
            disabled={!canUpload}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {step === 'uploading' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Upload & Process
          </button>
        </div>

        {step === 'uploading' && (
          <div className="mt-4 space-y-3">
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-sm text-slate-500">{uploadProgress}% uploaded</p>
          </div>
        )}

        {step === 'complete' && (
          <div className="mt-4 flex items-center gap-2 text-emerald-600">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Uploaded! Opening details…</span>
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
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              Retry upload
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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

