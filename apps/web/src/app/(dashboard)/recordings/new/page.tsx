'use client';

import type React from 'react';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { Upload, FileAudio, X, Loader2, CheckCircle } from 'lucide-react';
import { useUploadRecording } from '@/hooks/use-recordings';
import { cn } from '@twin/ui';

const MODES = [
  { value: 'general', label: 'General', description: 'General conversation or discussion' },
  { value: 'meeting', label: 'Meeting', description: 'Team meetings and standups' },
  { value: 'sales', label: 'Sales Call', description: 'Sales conversations and demos' },
  { value: 'interview', label: 'Interview', description: 'Job interviews and screenings' },
];

const ACCEPTED_TYPES = {
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/webm': ['.webm'],
  'audio/ogg': ['.ogg'],
  'audio/mp4': ['.mp4', '.m4a'],
  'audio/x-m4a': ['.m4a'],
  'audio/flac': ['.flac'],
};

type UploadStep = 'select' | 'uploading' | 'processing' | 'complete' | 'error';

export default function NewRecordingPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('general');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [step, setStep] = useState<UploadStep>('select');
  const [error, setError] = useState<string | null>(null);

  const uploadMutation = useUploadRecording();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const audioFile = acceptedFiles[0];
      if (audioFile) {
        setFile(audioFile);
        if (!title) {
          const nameWithoutExt = audioFile.name.replace(/\.[^/.]+$/, '');
          setTitle(nameWithoutExt);
        }
      }
    },
    [title]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) return;

    setStep('uploading');
    setError(null);

    try {
      const result = await uploadMutation.mutateAsync({
        file,
        title,
        mode,
        onProgress: setUploadProgress,
      });

      setStep('complete');

      setTimeout(() => {
        router.push(`/recordings/${result.recordingId}`);
      }, 1500);
    } catch (err) {
      setStep('error');
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const handleReset = () => {
    setFile(null);
    setTitle('');
    setMode('general');
    setUploadProgress(0);
    setStep('select');
    setError(null);
  };

  return (
    <div className="animate-fadeIn mx-auto max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* File Upload */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <h2 className="mb-4 text-lg font-semibold text-white">Upload Audio</h2>

          {!file ? (
            <div
              {...getRootProps()}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-all duration-300',
                isDragActive
                  ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.15)]'
                  : 'border-white/20 hover:border-emerald-500/50 hover:bg-white/5'
              )}
            >
              <input {...getInputProps()} />
              <Upload
                className={cn(
                  'mb-4 h-12 w-12 transition-colors',
                  isDragActive ? 'text-emerald-400' : 'text-slate-500'
                )}
              />
              <p className="mb-2 text-center text-sm font-medium text-slate-200">
                {isDragActive ? 'Drop your audio file here' : 'Drag & drop your audio file'}
              </p>
              <p className="text-center text-xs text-slate-500">
                or click to select &bull; MP3, WAV, M4A, WebM, OGG &bull; Max 500MB
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/20">
                <FileAudio className="h-6 w-6 text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">{file.name}</p>
                <p className="text-sm text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              {step === 'select' && (
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Title Input */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <label htmlFor="title" className="mb-2 block text-lg font-semibold text-white">
            Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a title for this recording"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            disabled={step !== 'select'}
          />
        </div>

        {/* Mode Selector */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <h2 className="mb-4 text-lg font-semibold text-white">Recording Type</h2>
          <div className="grid grid-cols-2 gap-3">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                disabled={step !== 'select'}
                className={cn(
                  'rounded-xl border-2 p-4 text-left transition-all duration-200',
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

        {/* Progress / Status */}
        {step !== 'select' && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
            {step === 'uploading' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                  <span className="font-medium text-white">Uploading...</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-sm text-slate-400">{uploadProgress}% complete</p>
              </div>
            )}

            {step === 'complete' && (
              <div className="flex items-center gap-3 text-emerald-400">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Upload complete! Redirecting...</span>
              </div>
            )}

            {step === 'error' && (
              <div className="space-y-4">
                <p className="text-red-400">{error}</p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/20"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}

        {/* Submit Button */}
        {step === 'select' && (
          <button
            type="submit"
            disabled={!file || !title}
            className={cn(
              'w-full rounded-xl py-4 text-lg font-semibold transition-all duration-200',
              file && title
                ? 'bg-emerald-500 text-white hover:scale-[1.01] hover:bg-emerald-400 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)]'
                : 'cursor-not-allowed bg-white/10 text-slate-600'
            )}
          >
            Upload & Process
          </button>
        )}
      </form>
    </div>
  );
}
