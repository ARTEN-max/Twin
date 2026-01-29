import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

export interface TranscodeResult {
  buffer: Buffer;
  mimeType: 'audio/wav';
  tempDir: string;
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase();
}

function extForMime(mimeType: string): string {
  const mt = normalizeMimeType(mimeType);
  if (mt === 'audio/webm') return 'webm';
  if (mt === 'audio/ogg') return 'ogg';
  if (mt === 'audio/mp4') return 'mp4';
  if (mt === 'audio/mpeg' || mt === 'audio/mp3') return 'mp3';
  if (mt === 'audio/wav' || mt === 'audio/wave') return 'wav';
  if (mt === 'audio/x-m4a' || mt === 'audio/m4a') return 'm4a';
  return 'bin';
}

async function downloadUrlToFile(url: string, filePath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download audio for transcoding: ${res.status}`);
  }
  if (!res.body) {
    // Very old Node/fetch impls
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(path.dirname(filePath), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(filePath);
      ws.on('error', reject);
      ws.on('finish', resolve);
      ws.end(buf);
    });
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(filePath);
    ws.on('error', reject);
    ws.on('finish', resolve);
    Readable.fromWeb(res.body as unknown as ReadableStream).pipe(ws);
  });
}

async function runFfmpeg(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('error', (err) => {
      // ENOENT: ffmpeg not installed
      reject(
        new Error(
          err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'ffmpeg is not installed or not on PATH. Install ffmpeg or set ENABLE_FFMPEG_TRANSCODE=false.'
            : `Failed to run ffmpeg: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    });

    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited with code ${code}. ${stderr.trim()}`));
    });
  });
}

/**
 * Download a remote audio file and transcode it to WAV (16kHz, mono).
 * Uses a temp directory and returns the resulting WAV buffer.
 *
 * Caller should always clean up `tempDir` (or use `withTempTranscodeToWav16kMono`).
 */
export async function transcodeUrlToWav16kMono(params: {
  url: string;
  inputMimeType: string;
}): Promise<TranscodeResult> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'komuchi-audio-'));
  const inputPath = path.join(tempDir, `input.${extForMime(params.inputMimeType)}`);
  const outputPath = path.join(tempDir, 'output.wav');

  await downloadUrlToFile(params.url, inputPath);

  // -ac 1: mono, -ar 16000: 16kHz, -loglevel error: reduce noise
  await runFfmpeg(['-y', '-loglevel', 'error', '-i', inputPath, '-ac', '1', '-ar', '16000', outputPath]);

  const buffer = await readFile(outputPath);
  return { buffer, mimeType: 'audio/wav', tempDir };
}

/**
 * Helper wrapper that guarantees cleanup of the temp folder.
 */
export async function withTempTranscodeToWav16kMono<T>(
  params: { url: string; inputMimeType: string },
  fn: (wav: { buffer: Buffer; mimeType: 'audio/wav' }) => Promise<T>
): Promise<T> {
  const res = await transcodeUrlToWav16kMono(params);
  try {
    return await fn({ buffer: res.buffer, mimeType: res.mimeType });
  } finally {
    await rm(res.tempDir, { recursive: true, force: true });
  }
}

