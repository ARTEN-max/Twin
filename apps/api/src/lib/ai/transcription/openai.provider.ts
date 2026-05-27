import OpenAI from 'openai';
import type {
  TranscriptionProvider,
  TranscriptionInput,
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptSegment,
} from './types.js';
import { getEnv } from '../../env.js';

/**
 * OpenAI Whisper Transcription Provider
 *
 * Uses OpenAI's hosted Whisper model for transcription.
 * Good accuracy but no speaker diarization support.
 *
 * @see https://platform.openai.com/docs/guides/speech-to-text
 */
export class OpenAIWhisperProvider implements TranscriptionProvider {
  readonly name = 'openai';
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = getEnv().OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async transcribe(
    input: TranscriptionInput,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const client = this.getClient();

    // OpenAI requires a file, so we need to handle URL input
    let audioBuffer: Buffer;
    let mimeType: string;

    if (input.type === 'buffer') {
      audioBuffer = input.data;
      mimeType = input.mimeType;
    } else {
      // Download from URL
      const response = await fetch(input.url);
      if (!response.ok) {
        throw new Error(`Failed to download audio: ${response.status}`);
      }
      audioBuffer = Buffer.from(await response.arrayBuffer());
      mimeType = input.mimeType || response.headers.get('content-type') || 'audio/mpeg';
    }

    // Convert buffer to File object
    const extension = this.getExtension(mimeType);
    const file = new File([audioBuffer], `audio.${extension}`, { type: mimeType });

    // Use verbose_json to get timestamps
    const response = await client.audio.transcriptions.create({
      file,
      model: options.model || 'whisper-1',
      response_format: 'verbose_json',
      language: options.language, // Optional - let Whisper auto-detect if not specified
      timestamp_granularities: ['segment'],
    });

    // Build segments from response
    const segments: TranscriptSegment[] = (response.segments ?? []).map((seg) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
      // OpenAI Whisper doesn't support speaker diarization
      speaker: undefined,
    }));

    return {
      text: response.text,
      segments,
      language: response.language ?? options.language ?? 'und',
      duration: response.duration,
      metadata: {
        model: 'whisper-1',
      },
    };
  }

  private getExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/wave': 'wav',
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/mp4': 'mp4',
      'audio/m4a': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/flac': 'flac',
    };
    return map[mimeType] || 'mp3';
  }
}
