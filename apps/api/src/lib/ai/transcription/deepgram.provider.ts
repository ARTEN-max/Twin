import { createClient, type DeepgramClient } from '@deepgram/sdk';
import type {
  TranscriptionProvider,
  TranscriptionInput,
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptSegment,
} from './types.js';

/**
 * Deepgram Transcription Provider
 *
 * Fast and reliable transcription with excellent accuracy.
 * Supports speaker diarization, punctuation, and multiple languages.
 *
 * @see https://developers.deepgram.com/docs
 */
export class DeepgramProvider implements TranscriptionProvider {
  readonly name = 'deepgram';
  private client: DeepgramClient | null = null;

  private getClient(): DeepgramClient {
    if (!this.client) {
      const apiKey = process.env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        throw new Error('DEEPGRAM_API_KEY environment variable is required');
      }
      this.client = createClient(apiKey);
    }
    return this.client;
  }

  isConfigured(): boolean {
    return !!process.env.DEEPGRAM_API_KEY;
  }

  async transcribe(
    input: TranscriptionInput,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const client = this.getClient();

    // Build Deepgram options. Only send `language` when explicitly provided;
    // otherwise Deepgram should auto-detect instead of being biased to English.
    const deepgramOptions = {
      model: options.model || 'nova-2',
      smart_format: true,
      punctuate: options.punctuate ?? true,
      diarize: options.diarize ?? false,
      utterances: true, // Get segments
      detect_language: !options.language, // Auto-detect if not specified
    };

    if (options.language) {
      Object.assign(deepgramOptions, { language: options.language });
    }

    let response;

    if (input.type === 'buffer') {
      // Transcribe from buffer
      response = await client.listen.prerecorded.transcribeFile(input.data, deepgramOptions);
    } else {
      // Transcribe from URL
      response = await client.listen.prerecorded.transcribeUrl({ url: input.url }, deepgramOptions);
    }

    // Extract results
    const result = response.result;
    if (!result?.results?.channels?.[0]?.alternatives?.[0]) {
      throw new Error('No transcription results returned from Deepgram');
    }

    const channel = result.results.channels[0];
    const alternative = channel.alternatives[0];
    const detectedLanguage = channel.detected_language || options.language || 'en';

    // Build segments from utterances or words
    const segments = this.buildSegments(alternative, options.diarize ?? false);

    return {
      text: alternative.transcript,
      segments,
      language: detectedLanguage,
      duration: result.metadata?.duration,
      metadata: {
        model: result.metadata?.model_info?.name,
        confidence: alternative.confidence,
        channels: result.metadata?.channels,
      },
    };
  }

  private buildSegments(
    alternative: {
      transcript: string;
      confidence: number;
      words?: Array<{
        word: string;
        start: number;
        end: number;
        confidence: number;
        speaker?: number;
      }>;
      paragraphs?: {
        paragraphs: Array<{
          sentences: Array<{
            text: string;
            start: number;
            end: number;
          }>;
          speaker?: number;
        }>;
      };
    },
    diarize: boolean
  ): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];

    // Use paragraphs if available (better segmentation)
    if (alternative.paragraphs?.paragraphs) {
      for (const para of alternative.paragraphs.paragraphs) {
        for (const sentence of para.sentences) {
          segments.push({
            start: sentence.start,
            end: sentence.end,
            text: sentence.text.trim(),
            speaker: diarize && para.speaker !== undefined ? `Speaker ${para.speaker}` : undefined,
          });
        }
      }
      return segments;
    }

    // Fall back to word-based segmentation
    if (alternative.words && alternative.words.length > 0) {
      let currentSegment: TranscriptSegment | null = null;
      let currentSpeaker: number | undefined;

      for (const word of alternative.words) {
        const shouldStartNew =
          !currentSegment ||
          (diarize && word.speaker !== currentSpeaker) ||
          currentSegment.text.length > 200; // Break long segments

        if (shouldStartNew) {
          if (currentSegment) {
            segments.push(currentSegment);
          }
          currentSegment = {
            start: word.start,
            end: word.end,
            text: word.word,
            speaker: diarize && word.speaker !== undefined ? `Speaker ${word.speaker}` : undefined,
            confidence: word.confidence,
          };
          currentSpeaker = word.speaker;
        } else if (currentSegment) {
          // TypeScript needs explicit null check here
          currentSegment.end = word.end;
          currentSegment.text += ' ' + word.word;
        }
      }

      if (currentSegment) {
        segments.push(currentSegment);
      }
    }

    return segments;
  }
}
