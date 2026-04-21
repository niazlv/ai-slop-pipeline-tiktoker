import { Telegraf } from 'telegraf';
import { SessionStore } from './session-store.js';
import { NotificationService } from './notification-service.js';
import { WorkflowAdapter } from './workflow-adapter.js';
import { AccessGuard } from './access-guard.js';
import { DialogFSM } from './dialog-fsm.js';
import { logger } from './logger.js';

export class BotApp {
  private telegraf: Telegraf;
  private sessionStore: SessionStore;
  private dialogFSM: DialogFSM;

  constructor(token: string) {
    this.telegraf = new Telegraf(token);
    this.sessionStore = new SessionStore();
    
    const accessGuard = new AccessGuard();
    const notificationService = new NotificationService(this.telegraf);
    const workflowAdapter = new WorkflowAdapter();
    
    this.dialogFSM = new DialogFSM(
      this.sessionStore,
      notificationService,
      workflowAdapter,
      accessGuard
    );

    this.setupMiddleware();
    this.setupHandlers();
  }

  private setupMiddleware(): void {
    // Log all incoming updates
    this.telegraf.use((ctx, next) => {
      const updateType = ctx.updateType;
      const userId = ctx.from?.id;
      const chatId = ctx.chat?.id;
      
      logger.info('Incoming update', { 
        updateType, 
        userId, 
        chatId,
        messageType: 'message' in ctx.update ? ('text' in ctx.update.message ? 'text' : 'other') : undefined
      });
      
      return next();
    });
  }

  private setupHandlers(): void {
    // Command handlers
    this.telegraf.command('start', (ctx) => this.dialogFSM.handleCommand(ctx, 'start'));
    this.telegraf.command('help', (ctx) => this.dialogFSM.handleCommand(ctx, 'help'));
    this.telegraf.command('cancel', (ctx) => this.dialogFSM.handleCommand(ctx, 'cancel'));

    // Text message handler
    this.telegraf.on('text', (ctx) => {
      // Skip if it's a command (starts with /)
      const text = ctx.message.text;
      if (text.startsWith('/')) {
        // Unknown command
        const command = text.slice(1).split(' ')[0];
        return this.dialogFSM.handleCommand(ctx, command);
      }
      return this.dialogFSM.handleText(ctx);
    });

    // Callback query handler
    this.telegraf.on('callback_query', (ctx) => this.dialogFSM.handleCallback(ctx));

    // Catch-all for unknown commands
    this.telegraf.use((ctx) => {
      if ('message' in ctx.update && ctx.update.message && 'text' in ctx.update.message) {
        const text = ctx.update.message.text;
        if (text?.startsWith('/')) {
          const command = text.slice(1).split(' ')[0];
          return ctx.reply(`❓ Команда /${command} не распознана. Используйте /help для справки.`);
        }
      }
    });
  }

  async start(): Promise<void> {
    try {
      // Get bot info
      const botInfo = await this.telegraf.telegram.getMe();
      logger.info('Bot started successfully', { 
        name: botInfo.first_name, 
        username: botInfo.username 
      });
      console.log(`🤖 Bot started: ${botInfo.first_name} (@${botInfo.username})`);
      
      // Start long polling
      await this.telegraf.launch();
      logger.info('Long polling started');
    } catch (error) {
      logger.error('Failed to start bot', { error: String(error) });
      throw error;
    }
  }

  stop(signal: string): void {
    logger.info('Bot stopping', { signal });
    this.telegraf.stop(signal);
    logger.info('Bot stopped');
  }
}