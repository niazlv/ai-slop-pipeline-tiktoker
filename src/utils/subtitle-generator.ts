import fs from 'fs';
import path from 'path';

export interface SubtitleWord {
  text: string;
  start: number;
  end: number;
}

interface SubtitlePhrase {
  words: SubtitleWord[];
  start: number;
  end: number;
  text: string;
}

/**
 * Formats time in seconds to ASS timestamp format: H:MM:SS.CC
 */
function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Groups words into phrases (3-4 words each, or split on pauses > 300ms)
 */
function groupWordsIntoPhrases(words: SubtitleWord[], maxWordsPerPhrase: number = 3): SubtitlePhrase[] {
  const phrases: SubtitlePhrase[] = [];
  let currentWords: SubtitleWord[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    currentWords.push(word);

    const nextWord = words[i + 1];
    const pauseAfter = nextWord ? nextWord.start - word.end : 0;

    // Split on: max words reached, or pause > 300ms
    if (currentWords.length >= maxWordsPerPhrase || pauseAfter > 0.3 || i === words.length - 1) {
      phrases.push({
        words: [...currentWords],
        start: currentWords[0].start,
        end: currentWords[currentWords.length - 1].end,
        text: currentWords.map(w => w.text).join(' '),
      });
      currentWords = [];
    }
  }

  return phrases;
}

/**
 * Generates an ASS subtitle file from word-level timestamps.
 * Style: TikTok/Reels — bold white text, slightly below center, black outline.
 * Each phrase highlights the current word in yellow.
 */
export function generateSubtitleFile(
  words: SubtitleWord[],
  outputPath: string,
  aspectRatio: '16:9' | '9:16' = '9:16'
): string {
  console.log('\n' + '='.repeat(60));
  console.log('📝  SUBTITLE GENERATION (ASS)');
  console.log('='.repeat(60));
  console.log('📥 Words count:', words.length);
  console.log('📐 Aspect ratio:', aspectRatio);

  const phrases = groupWordsIntoPhrases(words, 3);
  console.log('📊 Phrases count:', phrases.length);

  // ASS resolution and positioning
  const playResX = aspectRatio === '9:16' ? 720 : 1280;
  const playResY = aspectRatio === '9:16' ? 1280 : 720;
  // Slightly below center: MarginV pushes UP from bottom, so ~35% from bottom
  const marginV = aspectRatio === '9:16' ? 350 : 200;
  const fontSize = aspectRatio === '9:16' ? 52 : 42;

  // ASS header
  const header = `[Script Info]
Title: Generated Subtitles
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,20,20,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Generate dialogue lines with word-by-word highlighting
  const dialogueLines: string[] = [];

  for (const phrase of phrases) {
    const start = formatAssTime(phrase.start);
    const end = formatAssTime(phrase.end);

    // For each word timing within the phrase, create karaoke-style highlighting
    // Using {\kf} tags for smooth fill effect
    let karaokeText = '';
    for (let i = 0; i < phrase.words.length; i++) {
      const word = phrase.words[i];
      // Duration in centiseconds for this word
      const wordDuration = Math.max(Math.round((word.end - word.start) * 100), 10);

      // Gap between previous word end and this word start
      if (i > 0) {
        const gap = Math.max(Math.round((word.start - phrase.words[i - 1].end) * 100), 0);
        if (gap > 0) {
          karaokeText += `{\\kf${gap}} `;
        } else {
          karaokeText += ' ';
        }
      }

      karaokeText += `{\\kf${wordDuration}}${word.text}`;
    }

    // Yellow highlight color for karaoke: {\1c&H00FFFF&} (BGR format: yellow = 00FFFF)
    const styledText = `{\\1c&HFFFFFF&\\3c&H000000&\\kf0}${karaokeText}`;
    dialogueLines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${styledText}`);
  }

  const assContent = header + dialogueLines.join('\n') + '\n';

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, assContent, 'utf-8');

  console.log('✅ Subtitle file created:', outputPath);
  console.log('📊 File size:', (Buffer.byteLength(assContent) / 1024).toFixed(2), 'KB');
  console.log('📝 Dialogue lines:', dialogueLines.length);
  console.log('='.repeat(60) + '\n');

  return outputPath;
}
