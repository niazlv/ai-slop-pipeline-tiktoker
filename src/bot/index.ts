import 'dotenv/config';
import { BotApp } from './bot-app.js';

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN is not set');
    process.exit(1);
  }

  const bot = new BotApp(token);
  
  try {
    await bot.start();
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }

  // Graceful shutdown
  process.once('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    bot.stop('SIGINT');
  });
  
  process.once('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    bot.stop('SIGTERM');
  });
}

main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});