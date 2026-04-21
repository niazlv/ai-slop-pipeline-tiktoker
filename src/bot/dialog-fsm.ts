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
/status — проверить статус генерации
/cancel — отменить текущую генерацию

✨ Новые возможности:
• 📊 Показ прогресса в реальном времени
• 🔄 Автоматический переход на бесплатные модели при ошибках
• 🎛 Детальный контроль: редактирование сценария и промптов
• 📝 Поддержка субтитров`;

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

    if (command === 'status') {
      const session = this.store.get(userId);
      if (session.state === 'GENERATING') {
        const elapsed = session.startedAt ? Math.floor((Date.now() - session.startedAt.getTime()) / 1000) : 0;
        await ctx.reply(`⏳ Генерация в процессе...\n⏱ Прошло времени: ${elapsed} сек\n🔄 Используйте /cancel для отмены`);
      } else {
        await ctx.reply('✅ Бот готов к работе. Отправьте описание видео для начала генерации.');
      }
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

    // Handle story editing
    if (session.state === 'STORY_REVIEW') {
      const newStoryText = text.trim();
      if (newStoryText) {
        session.storyText = newStoryText;
        session.progressMessageId = undefined; // Clear old progress message
        this.store.set(userId, session);
        
        await ctx.reply('✅ Сценарий обновлён. Генерирую новые промпты...');
        
        try {
          // Regenerate prompts with new story
          const params = session.params as GenerationParams;
          const workflow = new (await import('../workflows/video-generation-workflow.js')).VideoGenerationWorkflow(params.useFreeModels);
          const promptMappings = await workflow.generateVideoPrompts(newStoryText, params.duration);
          session.prompts = promptMappings.map(m => m.prompt);
          session.state = 'PROMPTS_REVIEW';
          this.store.set(userId, session);

          const promptsText = session.prompts.map((prompt, i) => `${i + 1}. ${prompt}`).join('\n\n');
          await ctx.reply(
            `🎬 **Обновлённые промпты для кадров:**\n\n${promptsText}\n\n👆 Проверьте промпты перед генерацией:`,
            { 
              reply_markup: KeyboardBuilder.promptsReviewKeyboard(),
              parse_mode: 'Markdown'
            }
          );
        } catch (error) {
          logger.error('Prompt regeneration failed', { userId, error: String(error) });
          await ctx.reply(`❌ Ошибка генерации промптов: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
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
    logger.debug(`Session state`, { userId, state: session.state, params: session.params });

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
      session.state = 'AWAITING_GENERATION_MODE';
      this.store.set(userId, session);
      await ctx.reply('Выберите режим генерации:', { reply_markup: KeyboardBuilder.generationModeKeyboard() });
      return;
    }

    // Generation mode selection
    if (callbackData.startsWith(`${CALLBACK_PREFIXES.GEN_MODE}:`) && session.state === 'AWAITING_GENERATION_MODE') {
      const genMode = callbackData.split(':')[1] as 'simple' | 'detailed';
      session.params.generationMode = genMode;
      
      if (genMode === 'simple') {
        session.params.withSubtitles = false;
        session.state = 'AWAITING_CONFIRMATION';
        const voiceName = AVAILABLE_VOICES.find(v => v.id === session.params.voiceId)?.name ?? session.params.voiceId;
        const summary = this.buildSummary(session.params, voiceName ?? '');
        await ctx.reply(summary, { reply_markup: KeyboardBuilder.confirmationKeyboard() });
      } else {
        session.state = 'AWAITING_CONFIRMATION';
        await ctx.reply('Добавить субтитры к видео?', { reply_markup: KeyboardBuilder.subtitlesKeyboard() });
      }
      this.store.set(userId, session);
      return;
    }

    // Subtitles selection (detailed mode only)
    if (callbackData.startsWith(`${CALLBACK_PREFIXES.SUBTITLES}:`) && session.state === 'AWAITING_CONFIRMATION') {
      const withSubtitles = callbackData.split(':')[1] === 'yes';
      session.params.withSubtitles = withSubtitles;
      this.store.set(userId, session);

      const voiceName = AVAILABLE_VOICES.find(v => v.id === session.params.voiceId)?.name ?? session.params.voiceId;
      const summary = this.buildSummary(session.params, voiceName ?? '');
      await ctx.reply(summary, { reply_markup: KeyboardBuilder.confirmationKeyboard() });
      return;
    }

    // Confirm generation
    if (callbackData === CALLBACK_PREFIXES.CONFIRM && session.state === 'AWAITING_CONFIRMATION') {
      const params = session.params as GenerationParams;
      
      if (params.generationMode === 'detailed') {
        // Detailed mode: show story first
        session.state = 'STORY_REVIEW';
        this.store.set(userId, session);
        
        const progressMsgId = await this.notifier.sendProgressMessage(chatId, '📝 Генерирую сценарий...');
        session.progressMessageId = progressMsgId;
        this.store.set(userId, session);

        try {
          const result = await this.workflowAdapter.generateStoryAndPrompts(params);
          session.storyText = result.storyText;
          session.prompts = result.prompts;
          session.progressMessageId = undefined; // Clear old progress message
          this.store.set(userId, session);

          await ctx.reply(
            `📖 **Сценарий видео:**\n\n${result.storyText}\n\n👆 Проверьте сценарий перед продолжением:`,
            { 
              reply_markup: KeyboardBuilder.storyReviewKeyboard(),
              parse_mode: 'Markdown'
            }
          );
        } catch (error) {
          logger.error('Story generation failed', { userId, error: String(error) });
          await this.notifier.sendMessage(chatId, `❌ Ошибка генерации сценария: ${error instanceof Error ? error.message : String(error)}. Попробуйте ещё раз.`);
          this.store.clear(userId);
        }
      } else {
        // Simple mode: start generation immediately
        this.startGeneration(ctx, userId, chatId, params);
      }
      return;
    }

    // Story review callbacks
    if (callbackData === CALLBACK_PREFIXES.STORY_OK && session.state === 'STORY_REVIEW') {
      // Show prompts
      session.state = 'PROMPTS_REVIEW';
      this.store.set(userId, session);

      const promptsText = session.prompts!.map((prompt, i) => `${i + 1}. ${prompt}`).join('\n\n');
      await ctx.reply(
        `🎬 **Промпты для кадров:**\n\n${promptsText}\n\n👆 Проверьте промпты перед генерацией:`,
        { 
          reply_markup: KeyboardBuilder.promptsReviewKeyboard(),
          parse_mode: 'Markdown'
        }
      );
      return;
    }

    if (callbackData === CALLBACK_PREFIXES.STORY_EDIT && session.state === 'STORY_REVIEW') {
      await ctx.reply('✏️ Отправьте новый текст сценария:');
      // Stay in STORY_REVIEW state to handle text input
      return;
    }

    // Prompts review callbacks
    if (callbackData === CALLBACK_PREFIXES.PROMPTS_OK && session.state === 'PROMPTS_REVIEW') {
      const params = session.params as GenerationParams;
      
      // Validate that all required params are set
      if (!params.description || !params.duration || !params.aspectRatio || !params.voiceId || 
          params.useFreeModels === undefined || !params.generationMode || params.withSubtitles === undefined) {
        logger.error('Incomplete params in prompts review', { userId, params });
        await ctx.reply('❌ Ошибка: не все параметры заданы. Начните заново с /start');
        this.store.clear(userId);
        return;
      }
      
      logger.info('Starting generation from prompts review', { userId, params });
      this.startGeneration(ctx, userId, chatId, params, session.storyText, session.prompts);
      return;
    }

    if (callbackData === CALLBACK_PREFIXES.PROMPTS_EDIT && session.state === 'PROMPTS_REVIEW') {
      await ctx.reply('✏️ Функция редактирования промптов будет добавлена в следующей версии. Пока что нажмите "Промпты подходят" для продолжения.');
      return;
    }
  }

  private buildSummary(params: Partial<GenerationParams>, voiceName: string): string {
    const modeLabel = params.useFreeModels ? '🆓 Бесплатный' : '⚡ Стандартный';
    const genModeLabel = params.generationMode === 'detailed' ? '🎛 Детальный контроль' : '🚀 Быстрая генерация';
    const subtitlesLabel = params.withSubtitles ? '✅ Да' : '❌ Нет';
    
    return `📋 Параметры генерации:
📝 Описание: ${params.description}
⏱ Длительность: ${params.duration} сек
📐 Формат: ${params.aspectRatio}
🎙 Голос: ${voiceName}
⚡ Режим: ${modeLabel}
🎮 Генерация: ${genModeLabel}${params.generationMode === 'detailed' ? `\n📝 Субтитры: ${subtitlesLabel}` : ''}

Начать генерацию?`;
  }

  private startGeneration(ctx: Context, userId: number, chatId: number, params: GenerationParams, storyText?: string, prompts?: string[]): void {
    const abortController = new AbortController();
    const session = this.store.get(userId);
    session.state = 'GENERATING';
    session.abortController = abortController;
    session.startedAt = new Date();
    session.progressMessageId = undefined; // Clear any old progress message
    this.store.set(userId, session);

    logger.info('Generation started', { userId, params, hasCustomStory: !!storyText, hasCustomPrompts: !!prompts });

    // Always send a new progress message for video generation
    this.notifier.sendProgressMessage(chatId, '🚀 Генерация видео начата! Это займёт несколько минут...').then(msgId => {
      const currentSession = this.store.get(userId);
      currentSession.progressMessageId = msgId;
      this.store.set(userId, currentSession);
    }).catch(err => {
      logger.warn('Failed to send initial progress message', { error: String(err) });
    });

    // Run generation asynchronously — do not await
    this.workflowAdapter.run(
      params,
      (stage, current, total, details) => {
        const text = this.notifier.formatProgressText(stage, current, total, details);
        const currentSession = this.store.get(userId);
        if (currentSession.progressMessageId) {
          this.notifier.updateProgressMessage(chatId, currentSession.progressMessageId, text).catch(err => {
            logger.warn('Failed to update progress message', { error: String(err) });
          });
        }
      },
      abortController.signal,
      storyText,
      prompts
    ).then(async (finalVideoPath) => {
      logger.info('Generation completed', { userId, finalVideoPath });
      const subtitlesNote = params.withSubtitles ? ' 📝 С субтитрами' : '';
      const modelNote = params.useFreeModels ? ' 🆓 Бесплатные модели' : ' ⚡ Премиум модели';
      const caption = `🎬 ${params.description}\n⏱️ ${params.duration} сек | 📐 ${params.aspectRatio}${subtitlesNote}${modelNote}`;
      await this.notifier.sendVideo(chatId, finalVideoPath, caption);
      await this.notifier.sendMessage(chatId, '✨ Готово! Отправьте новое описание для создания ещё одного видео.');
      
      // Log successful generation for monitoring
      const elapsed = session.startedAt ? Math.floor((Date.now() - session.startedAt.getTime()) / 1000) : 0;
      logger.info('Generation completed successfully', { 
        userId, 
        description: params.description,
        duration: params.duration,
        aspectRatio: params.aspectRatio,
        useFreeModels: params.useFreeModels,
        withSubtitles: params.withSubtitles,
        elapsedSeconds: elapsed
      });
      
      this.store.clear(userId);
    }).catch(async (err: Error) => {
      if (err.message === 'Generation cancelled') {
        logger.info('Generation cancelled by user', { userId });
        return;
      }
      
      logger.error('Generation failed', { userId, error: err.message });
      
      // Provide user-friendly error messages
      let userMessage = '❌ Ошибка генерации: ';
      
      if (err.message.includes('Недостаточно средств') || err.message.includes('Exhausted balance')) {
        userMessage += 'Закончились средства на аккаунте для генерации видео. Администратор уведомлен о необходимости пополнения баланса.';
      } else if (err.message.includes('API access forbidden') || err.message.includes('Forbidden')) {
        userMessage += 'Проблема с доступом к API. Администратор уведомлен о проблеме.';
      } else if (err.message.includes('rate limit')) {
        userMessage += 'Превышен лимит запросов. Попробуйте через несколько минут.';
      } else if (err.message.includes('credits')) {
        userMessage += 'Недостаточно кредитов на аккаунте. Администратор уведомлен.';
      } else if (err.message.includes('content policy')) {
        userMessage += 'Контент нарушает политику безопасности. Попробуйте изменить описание.';
      } else {
        userMessage += err.message;
      }
      
      userMessage += '\n\n💡 Попробуйте ещё раз позже или используйте другое описание.';
      
      await this.notifier.sendMessage(chatId, userMessage);
      this.store.clear(userId);
    });
  }
}
