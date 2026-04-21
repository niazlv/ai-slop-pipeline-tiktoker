import { FalBaseClient } from './fal-base-client';

export type SpeechToTextInput = {
  audio_url: string;
  task?: 'transcribe' | 'translate';
  language_code?: string;
  diarize?: boolean;
  chunk_level?: 'segment' | 'word' | 'character';
  version?: string | number;
  batch_size?: number;
  prompt?: string;
  num_speakers?: number | null;
} & Record<string, unknown>;

export interface SpeechToTextOutput {
  text?: string;
  // Whisper format (may have start/end OR timestamp:[start,end])
  chunks?: Array<{
    text?: string;
    start?: number;
    end?: number;
    timestamp?: [number, number];
    speaker?: string;
  }>;
  // ElevenLabs format
  words?: Array<{
    text?: string;
    start?: number;
    end?: number;
    speaker?: string;
  }>;
  language_code?: string;
  language_probability?: number;
  inferred_languages?: string[];
  diarization_segments?: Array<{
    speaker?: string;
    start?: number;
    end?: number;
  }>;
}

export interface SpeechResult {
  languageCode: string;
  words: Array<{
    text: string;
    start: number;
    end: number;
  }>;
  combinedText: string;
  fullText: string;
  duration?: number;
}

export class SpeechToTextClient extends FalBaseClient {
  constructor(customApiKey?: string) {
    super('fal-ai/whisper');
    // super('fal-ai/elevenlabs/speech-to-text', customApiKey);
  }

  async transcribe(audioUrl: string): Promise<SpeechResult> {
    // 🎙️ SPEECH-TO-TEXT REQUEST
    console.log('\n' + '='.repeat(60));
    console.log('🎙️  SPEECH-TO-TEXT API CALL');
    console.log('='.repeat(60));
    console.log('📥 INPUT:');
    console.log('   🔊 Audio URL:', audioUrl);
    console.log('   🌍 Language:', 'en');
    console.log('   🤖 Model:', 'fal-ai/elevenlabs/speech-to-text');
    // console.log('   🤖 Model:', 'fal-ai/elevenlabs/speech-to-text');

    const input: SpeechToTextInput = {
      audio_url: audioUrl,
      task: 'transcribe',
      language_code: 'eng',
      diarize: true,
      tag_audio_events: true,

      chunk_level: 'word',
      version: '3',
      batch_size: 64,
    };
    console.log('   🤖 Input elevenlabs:', input);

    const job = await this.submitJob(input);

    const result = await this.waitForCompletion(job.jobId) as unknown as SpeechToTextOutput;

    // 📤 SPEECH-TO-TEXT OUTPUT
    console.log('\n📤 OUTPUT:');
    const resolvedLanguage = result.language_code || result.inferred_languages?.[0] || 'unknown';
    const flattenedWords = this.extractWords(result);
    console.log('   🗣️  Transcribed Text:', result.text || 'N/A');
    console.log('   🌍 Language:', resolvedLanguage);
    console.log('   📝 Words Count:', flattenedWords.length);
    if (flattenedWords.length > 0) {
      console.log('   ⏱️  Duration:', `${flattenedWords[flattenedWords.length - 1]?.end ?? 0}s`);
      console.log('   📋 Full Words Array:');
      console.log(JSON.stringify(flattenedWords, null, 2));
    }
    console.log('   🔄 RAW API RESPONSE:');
    console.log(JSON.stringify(result, null, 2));
    console.log('='.repeat(60) + '\n');

    const filteredWords = flattenedWords
      .filter(word => (word.text ?? '').trim() !== '')
      .map(word => ({
        text: (word.text ?? '').trim(),
        start: word.start ?? 0,
        end: word.end ?? word.start ?? 0,
      }))
      .filter(word => word.text.length > 0)
      .sort((a, b) => a.start - b.start);

    const wordsText = filteredWords.map(word => word.text);
    const transcribedText = result.text || wordsText.join(' ') || '';
    const duration = filteredWords.length > 0
      ? Math.max(...filteredWords.map(word => word.end))
      : 0;

    // Combined text for next step: language code + filtered words as JSON
    const combinedData = {
      languageCode: resolvedLanguage,
      words: filteredWords,
    };
    const combinedText = JSON.stringify(combinedData);

    return {
      languageCode: resolvedLanguage,
      words: filteredWords, // Filtered word objects with only text, start, end
      combinedText, // JSON string with languageCode and words for next step
      fullText: transcribedText,
      duration,
    };
  }

  private extractWords(result: SpeechToTextOutput): Array<{ text?: string; start?: number; end?: number }> {
    const aggregated: Array<{ text?: string; start?: number; end?: number }> = [];

    // Extract from words array (ElevenLabs format)
    if (Array.isArray(result.words)) {
      aggregated.push(...result.words.map(word => ({
        text: word.text,
        start: word.start,
        end: word.end,
      })));
    }
    // Extract from chunks array (Whisper format — may use timestamp:[start,end] or start/end)
    else if (Array.isArray(result.chunks)) {
      aggregated.push(...result.chunks.map(chunk => ({
        text: chunk.text,
        start: chunk.start ?? chunk.timestamp?.[0],
        end: chunk.end ?? chunk.timestamp?.[1],
      })));
    }

    // Fallback: if no words/chunks but text exists, create single item
    if (aggregated.length === 0 && result.text) {
      aggregated.push({
        text: result.text,
        start: 0,
        end: 0,
      });
    }

    return aggregated;
  }
}
