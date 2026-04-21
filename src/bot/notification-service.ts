import { Telegraf } from 'telegraf';
import fs from 'fs';
import { RetryHelper } from '../utils/retry-helper.js';

const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

const STAGE_LABELS: Record<string, string> = {
  story_generation: '📝 Генерация истории...',
  prompt_generation: '✍️ Генерация промптов...',
  image_generation: '🖼️ Генерация изображений...',
  video_generation: '🎬 Генерация видео...',
  audio_generation: '🎵 Генерация аудио...',
  transcription: '🎙️ Транскрипция аудио...',
  subtitle_generation: '📝 Создание субтитров...',
  merging: '🎞️ Сборка финального видео...',
};

export class NotificationService {
  constructor(private bot: Telegraf) {}

  async sendProgressMessage(chatId: number, text: string): Promise<number> {
    const message = await RetryHelper.retry(
      () => this.bot.telegram.sendMessage(chatId, text),
      { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 }
    );
    return message.message_id;
  }

  async updateProgressMessage(
    chatId: number,
    messageId: number,
    text: string
  ): Promise<void> {
    await RetryHelper.retry(
      () =>
        this.bot.telegram.editMessageText(chatId, messageId, undefined, text),
      { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 }
    );
  }

  async sendVideo(
    chatId: number,
    videoPath: string,
    caption: string
  ): Promise<void> {
    const stat = fs.statSync(videoPath);
    if (stat.size > MAX_VIDEO_SIZE_BYTES) {
      await this.sendMessage(
        chatId,
        '⚠️ Видео превышает лимит Telegram (50 МБ). Попробуйте уменьшить длительность.'
      );
      return;
    }

    await RetryHelper.retry(
      () =>
        this.bot.telegram.sendVideo(
          chatId,
          { source: videoPath },
          { caption }
        ),
      { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 }
    );
  }

  async sendMessage(
    chatId: number,
    text: string,
    extra?: object
  ): Promise<void> {
    await RetryHelper.retry(
      () => this.bot.telegram.sendMessage(chatId, text, extra as never),
      { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 }
    );
  }

  formatProgressText(stage: string, current?: number, total?: number, details?: string): string {
    const timestamp = new Date().toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
    
    if (stage === 'video_generation' && current !== undefined && total !== undefined) {
      const baseText = `🎬 Видео: ${current}/${total} сегментов`;
      const timeText = `⏰ ${timestamp}`;
      return details ? `${baseText}\n${details}\n${timeText}` : `${baseText}\n${timeText}`;
    }
    
    const stageText = STAGE_LABELS[stage] ?? `⏳ ${stage}`;
    return `${stageText}\n⏰ ${timestamp}`;
  }
}
