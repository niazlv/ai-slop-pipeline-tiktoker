// src/bot/logger.ts
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${timestamp}] [${level}] ${message}${metaStr}`);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log('INFO', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('WARN', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('ERROR', message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => log('DEBUG', message, meta),
};
