import { Context } from 'telegraf';
import { SessionStore } from './session-store.js';
import { NotificationService } from './notification-service.js';
import { WorkflowAdapter } from './workflow-adapter.js';
import { AccessGuard } from './access-guard.js';
import { KeyboardBuilder, AVAILABLE_VOICES } from './keyboard-builder.js';
import { GenerationParams, CALLBACK_PREFIXES } from './types.js';
import { logger } from './logger.js';

const WELCOME_MESSAGE = `👋 Привет! Я бот для генерации видео.

🎬 Отправь мне описание видео, которое хочешь создать, и я запущу процесс генерации.

📋 Доступные команды:
/start — начало работы
/help — справка
/cancel — отменить текущую генерацию`;

export class DialogFSM {
  constructor(
    private store: SessionStore,
    private notifier: NotificationService,
    private workflowAdapter: WorkflowAdapter,
    private accessGuard: AccessGuard
  ) {}

  async handleCommand(ctx: Context, command: string): Promise<void> {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!userId || !chatId) return;

    if (!this.accessGuard.isAllowed(userId)) {
      await ctx.reply('⛔ Доступ ограничен.');
      return;
    }

    logger.info(`Command received: /${command}`, { userId });

    if (command === 'start' || command === 'help') {
      await ctx.reply(WELCOME_MESSAGE);
      return;
    }

    if (command === 'cancel') {
      const session = this.store.get(userId);
      if (session.state === 'GENERATING') {
        session.abortController?.abort();
        this.store.clear(userId);
        await ctx.reply('✅ Генерация отменена.');
      } else {
        await ctx.reply('ℹ️ Нет активных запросов для отмены.');
      }
      return;
    }

    // Unknown command
    await ctx.reply(`❓ Команда /${command} не распознана. Используйте /help для справки.`);
  }

  async handleText(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!userId || !chatId) return;

    if (!this.accessGuard.isAllowed(userId)) {
      await ctx.reply('⛔ Доступ ограничен.');
      return;
    }

    const text = 'text' in ctx.message! ? (ctx.message as { text: string }).text : '';
    logger.info(`Text message received`, { userId, length: text.length });

    const session = this.store.get(userId);

    if (session.state === 'GENERATING') {
      await ctx.reply('⏳ Генерация уже выполняется. Дождитесь завершения или используйте /cancel.');
      return;
    }

    if (session.state !== 'IDLE') {
      // User is in the middle of parameter selection — ignore free text
      return;
    }

    // IDLE state: treat text as video description
    const description = text.trim();
    if (!description) return;

    session.params.description = description;
    session.state = 'AWAITING_DURATION';
    this.store.set(userId, session);

    await ctx.reply(
      `✅ Описание получено: «${description}»\n\nВыберите длительность видео:`,
      { reply_markup: KeyboardBuilder.durationKeyboard() }
    );
  }

  async handleCallback(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!userId || !chatId) return;

    // Always answer callback query to remove loading indicator
    await ctx.answerCbQuery();

    if (!this.accessGuard.isAllowed(userId)) {
      await ctx.reply('⛔ Доступ ограничен.');
      return;
    }

    const callbackData = 'data' in ctx.callbackQuery! ? (ctx.callbackQuery as { data: string }).data : '';
    logger.info(`Callback received`, { userId, callbackData });

    const session = this.store.get(userId);

    // Cancel from any state
    if (callbackData === CALLBACK_PREFIXES.CANCEL) {
      this.store.clear(userId);
      await ctx.reply('❌ Отменено. Отправьте новое описание для начала.');
      return;
    }

    // Duration selection
    if (callbackData.startsWith(`${CALLBACK_PREFIXES.DURATION}:`) && session.state === 'AWAITING_DURATION') {
      const duration = parseInt(callbackData.split(':')[1], 10) as 15 | 30 | 60;
      session.params.duration = duration;
      session.state = 'AWAITING_ASPECT_RATIO';
      this.store.set(userId, session);
      await ctx.reply('Выберите соотношение сторон:', { reply_markup: KeyboardBuilder.aspectRatioKeyboard() });
      return;
    }

    // Aspect ratio selection
    if (callbackData.startsWith(`${CALLBACK_PREFIXES.ASPECT}:`) && session.state === 'AWAITING_ASPECT_RATIO') {
      // aspect:9:16 or aspect:16:9 — take everything after first colon
      const aspectRatio = callbackData.substring(CALLBACK_PREFIXES.ASPECT.length + 1) as '9:16' | '16:9';
      session.params.aspectRatio = aspectRatio;
      session.state = 'AWAITING_VOICE';
      this.store.set(userId, session);
      await ctx.reply('Выберите голос:', { reply_markup: KeyboardBuilder.voiceKeyboard() });
      return;
    }

    // Voice selection
    if (callbackData.startsWith(`${CALLBACK_PREFIXES.VOICE}:`) && session.state === 'AWAITING_VOICE') {
      const voiceId = callbackData.substring(CALLBACK_PREFIXES.VOICE.length + 1);
      session.params.voiceId = voiceId;
      session.state = 'AWAITING_MODEL_MODE';
      this.store.set(userId, session);
      await ctx.reply('Выберите режим моделей:', { reply_markup: KeyboardBuilder.modelModeKeyboard() });
      return;
    }

    // Model mode selection
    if (callbackData.startsWith(`${CALLBACK_PREFIXES.MODE}:`) && session.state === 'AWAITING_MODEL_MODE') {
      const mode = callbackData.split(':')[1];
      session.params.useFreeModels = mode === 'free';
      session.state = 'AWAITING_CONFIRMATION';
      this.store.set(userId, session);

      const voiceName = AVAILABLE_VOICES.find(v => v.id === session.params.voiceId)?.name ?? session.params.voiceId;
      const summary = this.buildSummary(session.params, voiceName ?? '');
      await ctx.reply(summary, { reply_markup: KeyboardBuilder.confirmationKeyboard() });
      return;
    }

    // Confirm generation
    if (callbackData === CALLBACK_PREFIXES.CONFIRM && session.state === 'AWAITING_CONFIRMATION') {
      const params = session.params as GenerationParams;
      const abortController = new AbortController();
      session.state = 'GENERATING';
      session.abortController = abortController;
      session.startedAt = new Date();
      this.store.set(userId, session);

      const progressMsgId = await this.notifier.sendProgressMessage(chatId, '🚀 Генерация начата! Это займёт несколько минут...');
      session.progressMessageId = progressMsgId;
      this.store.set(userId, session);

      logger.info('Generation started', { userId, params });

      // Run generation asynchronously — do not await
      this.workflowAdapter.run(
        params,
        (stage, current, total) => {
          const text = this.notifier.formatProgressText(stage, current, total);
          const currentSession = this.store.get(userId);
          if (currentSession.progressMessageId) {
            this.notifier.updateProgressMessage(chatId, currentSession.progressMessageId, text).catch(err => {
              logger.warn('Failed to update progress message', { error: String(err) });
            });
          }
        },
        abortController.signal
      ).then(async (finalVideoPath) => {
        logger.info('Generation completed', { userId, finalVideoPath });
        const currentSession = this.store.get(userId);
        const caption = `🎬 ${params.description}\n⏱ ${params.duration} сек | 📐 ${params.aspectRatio}`;
        await this.notifier.sendVideo(chatId, finalVideoPath, caption);
        await this.notifier.sendMessage(chatId, '✨ Готово! Отправьте новое описание для создания ещё одного видео.');
        this.store.clear(userId);
      }).catch(async (err: Error) => {
        if (err.message === 'Generation cancelled') {
          logger.info('Generation cancelled by user', { userId });
          return;
        }
        logger.error('Generation failed', { userId, error: err.message });
        await this.notifier.sendMessage(chatId, `❌ Ошибка генерации: ${err.message}. Попробуйте ещё раз.`);
        this.store.clear(userId);
      });

      return;
    }
  }

  private buildSummary(params: Partial<GenerationParams>, voiceName: string): string {
    const modeLabel = params.useFreeModels ? '🆓 Бесплатный' : '⚡ Стандартный';
    return `📋 Параметры генерации:
📝 Описание: ${params.description}
⏱ Длительность: ${params.duration} сек
📐 Формат: ${params.aspectRatio}
🎙 Голос: ${voiceName}
⚡ Режим: ${modeLabel}

Начать генерацию?`;
  }
}
