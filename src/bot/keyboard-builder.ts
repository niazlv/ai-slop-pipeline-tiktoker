// src/bot/keyboard-builder.ts
import { InlineKeyboardMarkup } from 'telegraf/types';
import { CALLBACK_PREFIXES } from './types.js';

export const AVAILABLE_VOICES = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: '🎙 George (мужской, глубокий)' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: '🎙 Bella (женский, мягкий)' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: '🎙 Adam (мужской, нейтральный)' },
] as const;

export class KeyboardBuilder {
  static durationKeyboard(): InlineKeyboardMarkup {
    return {
      inline_keyboard: [[
        { text: '⏱ 15 сек', callback_data: `${CALLBACK_PREFIXES.DURATION}:15` },
        { text: '⏱ 30 сек', callback_data: `${CALLBACK_PREFIXES.DURATION}:30` },
        { text: '⏱ 60 сек', callback_data: `${CALLBACK_PREFIXES.DURATION}:60` },
      ]],
    };
  }

  static aspectRatioKeyboard(): InlineKeyboardMarkup {
    return {
      inline_keyboard: [[
        { text: '📱 9:16 (вертикальное)', callback_data: `${CALLBACK_PREFIXES.ASPECT}:9:16` },
        { text: '🖥 16:9 (горизонтальное)', callback_data: `${CALLBACK_PREFIXES.ASPECT}:16:9` },
      ]],
    };
  }

  static voiceKeyboard(): InlineKeyboardMarkup {
    return {
      inline_keyboard: AVAILABLE_VOICES.map(voice => ([
        { text: voice.name, callback_data: `${CALLBACK_PREFIXES.VOICE}:${voice.id}` },
      ])),
    };
  }

  static modelModeKeyboard(): InlineKeyboardMarkup {
    return {
      inline_keyboard: [[
        { text: '⚡ Стандартный', callback_data: `${CALLBACK_PREFIXES.MODE}:standard` },
        { text: '🆓 Бесплатный', callback_data: `${CALLBACK_PREFIXES.MODE}:free` },
      ]],
    };
  }

  static confirmationKeyboard(): InlineKeyboardMarkup {
    return {
      inline_keyboard: [[
        { text: '🚀 Начать генерацию', callback_data: CALLBACK_PREFIXES.CONFIRM },
        { text: '❌ Отмена', callback_data: CALLBACK_PREFIXES.CANCEL },
      ]],
    };
  }
}
