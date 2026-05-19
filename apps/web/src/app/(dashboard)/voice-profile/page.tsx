'use client';

import { useState, useEffect } from 'react';
import { Mic, Square, Loader2, CheckCircle, AlertCircle, Trash2, UserCircle } from 'lucide-react';
import { cn } from '@twin/ui';
import { formatTimer, useMediaRecorder } from '@/hooks/use-media-recorder';
import { useUserId } from '@/lib/auth';

type Step = 'idle' | 'checking' | 'uploading' | 'complete' | 'error';

export default function VoiceProfilePage() {
  const userId = useUserId();
  const [rec, controls] = useMediaRecorder();
  const [step, setStep] = useState<Step>('checking');
  const [error, setError] = useState<string | null>(null);
  const [hasProfile, setHasProfile] = useState(false);

  const isSecureContext = typeof window === 'undefined' ? true : window.isSecureContext;

  const canStart = rec.status === 'idle' && step === 'idle' && !hasProfile;
  const canStop = rec.status === 'recording' && step === 'idle';

  useEffect(() => {
    checkVoiceProfile();
  }, []);

  const checkVoiceProfile = async () => {
    try {
      setStep('checking');
      const response = await fetch('/api/voice-profile/status', {
        headers: {
          'x-user-id': userId,
        },
      });
      const data = await response.json();
      setHasProfile(data.hasVoiceProfile || false);
      setStep('idle');
    } catch {
      setError('Failed to check voice profile status');
      setStep('error');
    }
  };

  const startRecording = async () => {
    setError(null);
    await controls.start();
  };

  const resetAll = () => {
    setError(null);
    setStep('idle');
    controls.reset();
  };

  const uploadVoiceProfile = async () => {
    if (!rec.blob) return;

    const durationSeconds = rec.elapsedMs / 1000;
    if (durationSeconds < 5) {
      setError('Recording too short. Please record at least 5 seconds of your voice.');
      return;
    }
    if (durationSeconds > 60) {
      setError('Recording too long. Please keep it under 60 seconds.');
      return;
    }

    setStep('uploading');
    setError(null);

    try {
      const file = new File([rec.blob], 'voice-sample.webm', {
        type: rec.mimeType || 'audio/webm',
      });

      const formData = new FormData();
      formData.append('audio', file);

      const response = await fetch('/api/voice-profile/enroll', {
        method: 'POST',
        headers: {
          'x-user-id': userId,
        },
        body: formData,
      });

      if (!response.ok) {
        // Try to parse error response, handling both JSON and text responses
        let errorMessage = 'Failed to enroll voice profile';
        try {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } else {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          }
        } catch (_parseError) {
          // If parsing fails, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      setStep('complete');
      setHasProfile(true);
      controls.reset();
    } catch (e) {
      setStep('error');
      setError(e instanceof Error ? e.message : 'Failed to enroll voice profile');
    }
  };

  const deleteVoiceProfile = async () => {
    if (
      !confirm(
        'Are you sure you want to delete your voice profile? Future recordings will not use personalized diarization.'
      )
    ) {
      return;
    }

    try {
      setStep('uploading');
      const response = await fetch('/api/voice-profile', {
        method: 'DELETE',
        headers: {
          'x-user-id': userId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete voice profile');
      }

      setHasProfile(false);
      setStep('idle');
    } catch (e) {
      setStep('error');
      setError(e instanceof Error ? e.message : 'Failed to delete voice profile');
    }
  };

  return (
    <div className="animate-fadeIn mx-auto max-w-2xl space-y-8">
      {/* Header */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
            <UserCircle className="h-6 w-6 text-emerald-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">Voice Profile</h1>
            <p className="mt-1 text-sm text-slate-400">
              Create your voice profile for personalized speaker diarization. Your voice will be
              labeled as &quot;YOU&quot; in all future recordings.
            </p>
          </div>
        </div>
      </div>

      {/* Status */}
      {step === 'checking' && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            <span className="text-sm text-slate-400">Checking voice profile status...</span>
          </div>
        </div>
      )}

      {hasProfile && step !== 'checking' && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6 backdrop-blur-md">
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 h-5 w-5 text-emerald-400" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-300">Voice profile enrolled</p>
              <p className="mt-1 text-sm text-emerald-400/80">
                Your voice profile is active. All new recordings will use personalized diarization
                to identify your voice as &quot;YOU&quot;.
              </p>
              <button
                type="button"
                onClick={deleteVoiceProfile}
                disabled={step === 'uploading'}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-white/5 px-4 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete Voice Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {!hasProfile && step !== 'checking' && (
        <>
          {/* Instructions */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
            <h2 className="text-sm font-semibold text-white">How it works</h2>
            <ol className="mt-3 space-y-2 text-sm text-slate-400">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-400">
                  1
                </span>
                <span>Record 10-30 seconds of yourself speaking clearly</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-400">
                  2
                </span>
                <span>Upload your voice sample to create your profile</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-400">
                  3
                </span>
                <span>Future recordings will automatically identify you as &quot;YOU&quot;</span>
              </li>
            </ol>
          </div>

          {!isSecureContext && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-300 backdrop-blur-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 text-amber-400" />
                <div>
                  <p className="font-medium">Microphone requires a secure context</p>
                  <p className="mt-1 text-amber-400/80">
                    Use <span className="font-mono">http://localhost:3000</span> in dev, or HTTPS in
                    production.
                  </p>
                </div>
              </div>
            </div>
          )}

          {rec.permission === 'denied' && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300 backdrop-blur-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 text-red-400" />
                <div>
                  <p className="font-medium">Microphone permission denied</p>
                  <p className="mt-1 text-red-400/80">
                    Allow mic access for this site in your browser settings.
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300 backdrop-blur-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 text-red-400" />
                <div>
                  <p className="font-medium">Error</p>
                  <p className="mt-1 text-red-400/80">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Recorder */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Voice Sample</p>
                <p className="mt-1 text-sm text-slate-400">
                  Record 10-30 seconds of yourself speaking
                </p>
              </div>
              <div className="rounded-lg bg-white/10 px-3 py-1.5 font-mono text-sm text-slate-300">
                {formatTimer(rec.elapsedMs)}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={startRecording}
                disabled={!canStart || rec.permission === 'denied'}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02] hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100'
                )}
              >
                <Mic className="h-4 w-4" />
                Start Recording
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
                Reset
              </button>
            </div>

            {rec.audioUrl && rec.status === 'stopped' && (
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="mb-2 text-sm font-semibold text-white">Preview</p>
                <audio controls src={rec.audioUrl} className="w-full" />
                <p className="mt-2 text-xs text-slate-500">
                  Duration: {(rec.elapsedMs / 1000).toFixed(1)}s (recommended: 10-30s)
                </p>
              </div>
            )}
          </div>

          {/* Upload */}
          {rec.blob && rec.status === 'stopped' && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">Enroll Voice Profile</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Upload this recording to create your voice profile
                  </p>
                </div>
                <button
                  type="button"
                  onClick={uploadVoiceProfile}
                  disabled={step === 'uploading'}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02] hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                >
                  {step === 'uploading' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Enroll Voice
                </button>
              </div>

              {step === 'uploading' && (
                <div className="mt-4">
                  <p className="text-sm text-slate-400">Uploading and processing voice sample...</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
