# Implementation Plan: Telegram Bot Interface

## Overview

Реализация Telegram-бота как отдельного Node.js-процесса на TypeScript с использованием Telegraf v4. Бот принимает запросы пользователей, проводит их через многошаговый диалог выбора параметров (FSM) и запускает существующий `VideoGenerationWorkflow`, отправляя уведомления о прогрессе и доставляя готовое видео.

Тестирование: Vitest (unit-тесты) + fast-check (property-based тесты).

## Tasks

- [x] 1. Установить зависимости и настроить окружение
  - Установить `telegraf` и `@types/telegraf` (если нужны)
  - Установить `vitest` и `fast-check` как dev-зависимости
  - Добавить скрипты `"bot"` и `"bot:build"` в `package.json`
  - Добавить `TELEGRAM_BOT_TOKEN` и `TELEGRAM_ALLOWED_USER_IDS` в `.env.example`
  - Создать директорию `src/bot/` и `src/bot/__tests__/`
  - _Requirements: 1.1, 10.1_

- [x] 2. Реализовать типы и SessionStore
  - [x] 2.1 Создать `src/bot/types.ts` с общими типами
    - Определить `DialogState`, `GenerationParams`, `UserSession`, `CallbackData`-константы
    - _Requirements: 8.1, 4.1, 4.2, 4.3, 4.4_

  - [x] 2.2 Создать `src/bot/session-store.ts`
    - Реализовать класс `SessionStore` с `Map<number, UserSession>`
    - Методы: `get(userId)` (создаёт IDLE-сессию если нет), `set`, `clear`, `has`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 2.3 Написать property-тест для SessionStore — Property 9: Изоляция состояний
    - **Property 9: User state isolation**
    - **Validates: Requirements 8.1, 8.4**
    - Файл: `src/bot/__tests__/session-store.test.ts`

  - [ ]* 2.4 Написать property-тест для SessionStore — Property 10: Сброс состояния
    - **Property 10: State reset after generation completion**
    - **Validates: Requirements 8.2**
    - Файл: `src/bot/__tests__/session-store.test.ts`

- [x] 3. Реализовать вспомогательные модули
  - [x] 3.1 Создать `src/bot/logger.ts`
    - Функция `log(level, message, meta?)` — выводит ISO-timestamp + уровень + сообщение в stdout
    - _Requirements: 9.4_

  - [ ]* 3.2 Написать property-тест для logger — Property 14: Логирование с временными метками
    - **Property 14: Incoming messages logged with timestamps**
    - **Validates: Requirements 9.4**
    - Файл: `src/bot/__tests__/logger.test.ts`

  - [x] 3.3 Создать `src/bot/access-guard.ts`
    - Класс `AccessGuard`, читает `TELEGRAM_ALLOWED_USER_IDS` из env
    - Метод `isAllowed(userId: number): boolean` — `null`-allowlist = все разрешены
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]* 3.4 Написать property-тест для AccessGuard — Property 15: Фильтрация по allowlist
    - **Property 15: Allowlist filtering**
    - **Validates: Requirements 10.2, 10.3**
    - Файл: `src/bot/__tests__/access-guard.test.ts`

  - [x] 3.5 Создать `src/bot/keyboard-builder.ts`
    - Константа `AVAILABLE_VOICES` (3 голоса ElevenLabs)
    - Статические методы: `durationKeyboard()`, `aspectRatioKeyboard()`, `voiceKeyboard()`, `modelModeKeyboard()`, `confirmationKeyboard()`
    - Callback data в формате `duration:15`, `aspect:9:16`, `voice:<id>`, `mode:standard`, `confirm`, `cancel`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 4. Реализовать NotificationService
  - [x] 4.1 Создать `src/bot/notification-service.ts`
    - Класс `NotificationService(bot: Telegraf)`
    - `sendProgressMessage(chatId, text): Promise<number>` — отправляет сообщение, возвращает messageId
    - `updateProgressMessage(chatId, messageId, text): Promise<void>` — редактирует через `editMessageText`, retry до 3 раз с экспоненциальной задержкой (1s→2s→4s) через `RetryHelper`
    - `sendVideo(chatId, videoPath, caption): Promise<void>` — проверяет размер файла (≤50 МБ), иначе отправляет уведомление о лимите
    - `sendMessage(chatId, text, extra?): Promise<void>` — с retry-логикой
    - _Requirements: 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 9.1_

  - [ ]* 4.2 Написать property-тест — Property 5: Уведомления содержат название этапа
    - **Property 5: Progress notifications contain stage name**
    - **Validates: Requirements 5.2**
    - Файл: `src/bot/__tests__/notification-service.test.ts`

  - [ ]* 4.3 Написать property-тест — Property 6: Прогресс сегментов в формате current/total
    - **Property 6: Segment progress shows correct ratio**
    - **Validates: Requirements 5.3**
    - Файл: `src/bot/__tests__/notification-service.test.ts`

  - [ ]* 4.4 Написать property-тест — Property 7: Прогресс обновляется редактированием
    - **Property 7: Progress updated via edit, not new messages**
    - **Validates: Requirements 5.4**
    - Файл: `src/bot/__tests__/notification-service.test.ts`

  - [ ]* 4.5 Написать property-тест — Property 8: Подпись к видео содержит все параметры
    - **Property 8: Video caption contains all generation params**
    - **Validates: Requirements 6.2**
    - Файл: `src/bot/__tests__/notification-service.test.ts`

  - [ ]* 4.6 Написать property-тест — Property 11: Retry при ошибках Telegram API
    - **Property 11: Retry on Telegram API errors with exponential backoff**
    - **Validates: Requirements 9.1**
    - Файл: `src/bot/__tests__/notification-service.test.ts`

- [x] 5. Checkpoint — убедиться, что все тесты проходят
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Реализовать WorkflowAdapter
  - [x] 6.1 Создать `src/bot/workflow-adapter.ts`
    - Типы `ProgressCallback` и `PipelineStage`
    - Класс `WorkflowAdapter` с методом `run(params, onProgress, signal): Promise<string>`
    - Транслирует `GenerationParams` в параметры `VideoGenerationWorkflow`
    - Вызывает `onProgress` при переходе между этапами: `story_generation`, `prompt_generation`, `image_generation`, `video_generation`, `audio_generation`, `merging`
    - Проверяет `signal.aborted` перед каждым этапом
    - _Requirements: 5.1, 5.2, 5.3, 7.2_

  - [ ]* 6.2 Написать property-тест — Property 12: Перехват исключений pipeline
    - **Property 12: Pipeline exceptions are caught and reported to user**
    - **Validates: Requirements 9.2**
    - Файл: `src/bot/__tests__/workflow-adapter.test.ts`

- [ ] 7. Реализовать DialogFSM
  - [x] 7.1 Создать `src/bot/dialog-fsm.ts`
    - Класс `DialogFSM(store, notifier, workflowAdapter, accessGuard)`
    - `handleCommand(ctx, command)`: обрабатывает `/start`, `/help`, `/cancel`
      - `/start`, `/help` → приветственное сообщение с инструкцией (Requirements 2.1, 2.2, 2.3)
      - `/cancel` при GENERATING → `abortController.abort()`, сброс в IDLE (Requirements 7.1, 7.2)
      - `/cancel` при IDLE → уведомление "нет активных запросов" (Requirements 7.3)
    - `handleText(ctx)`: в состоянии IDLE → сохраняет description, переходит в AWAITING_DURATION, отправляет клавиатуру длительности; в GENERATING → уведомление о занятости (Requirements 3.1, 3.2, 3.3, 3.4)
    - `handleCallback(ctx)`: обрабатывает все callback data, выполняет FSM-переходы по графу состояний; при `confirm` → запускает `workflowAdapter.run()` асинхронно, обновляет прогресс через `notifier`; при `cancel` → сброс в IDLE (Requirements 4.1–4.6, 5.1–5.5, 6.1–6.4)
    - Проверяет `accessGuard.isAllowed()` для каждого входящего события (Requirements 10.2, 10.3)
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 4.1–4.6, 5.1–5.5, 6.1–6.4, 7.1–7.3, 8.1, 8.2, 9.2, 10.2, 10.3_

  - [ ]* 7.2 Написать property-тест — Property 1: Любой не-командный текст запускает диалог
    - **Property 1: Any non-command text triggers parameter selection dialog**
    - **Validates: Requirements 3.1, 3.2**
    - Файл: `src/bot/__tests__/dialog-fsm.test.ts`

  - [ ]* 7.3 Написать property-тест — Property 2: Занятость блокирует новые запросы
    - **Property 2: Busy state blocks new requests**
    - **Validates: Requirements 3.3**
    - Файл: `src/bot/__tests__/dialog-fsm.test.ts`

  - [ ]* 7.4 Написать property-тест — Property 3: Подтверждение содержит текст описания
    - **Property 3: Confirmation message contains description text**
    - **Validates: Requirements 3.4**
    - Файл: `src/bot/__tests__/dialog-fsm.test.ts`

  - [ ]* 7.5 Написать property-тест — Property 4: FSM-переходы при выборе параметров
    - **Property 4: FSM transitions on parameter selection**
    - **Validates: Requirements 4.2, 4.3, 4.4**
    - Файл: `src/bot/__tests__/dialog-fsm.test.ts`

- [x] 8. Реализовать BotApp и Entry Point
  - [x] 8.1 Создать `src/bot/bot-app.ts`
    - Класс `BotApp(token: string)`
    - Создаёт экземпляр `Telegraf`, `SessionStore`, `AccessGuard`, `NotificationService`, `WorkflowAdapter`, `DialogFSM`
    - Регистрирует middleware для логирования всех входящих обновлений (Requirements 9.4)
    - Регистрирует обработчики команд: `/start`, `/help`, `/cancel`
    - Регистрирует обработчик текстовых сообщений
    - Регистрирует обработчик callback_query
    - Регистрирует обработчик неизвестных команд (Requirements 9.3)
    - Метод `start()`: запускает long polling, логирует имя и username бота (Requirements 1.3, 1.4)
    - Метод `stop(signal)`: корректно останавливает polling (Requirements 1.5)
    - _Requirements: 1.3, 1.4, 1.5, 9.3, 9.4_

  - [x] 8.2 Создать `src/bot/index.ts`
    - Загружает `.env` через `dotenv/config`
    - Валидирует `TELEGRAM_BOT_TOKEN` — при отсутствии `process.exit(1)` с сообщением в stderr (Requirements 1.1, 1.2)
    - Создаёт `BotApp`, вызывает `bot.start()`
    - Регистрирует обработчики `SIGINT` и `SIGTERM` (Requirements 1.5)
    - _Requirements: 1.1, 1.2, 1.5_

  - [ ]* 8.3 Написать unit-тесты для BotApp — Property 13: Неизвестные команды получают ответ
    - **Property 13: Unknown commands receive a response**
    - **Validates: Requirements 9.3**
    - Файл: `src/bot/__tests__/bot-app.test.ts`
    - Дополнительно: unit-тест `/start` → приветственное сообщение содержит инструкцию; `/cancel` при IDLE → "нет активных запросов"; отсутствие `TELEGRAM_BOT_TOKEN` → process.exit(1)

- [x] 9. Checkpoint — убедиться, что все тесты проходят
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Интеграция и финальная проверка
  - [x] 10.1 Обновить `package.json`
    - Добавить скрипты `"bot": "tsx src/bot/index.ts"` и `"bot:build": "tsc && node dist/bot/index.js"`
    - _Requirements: 1.1_

  - [x] 10.2 Проверить TypeScript-компиляцию
    - Запустить `npm run type-check` и устранить все ошибки типов
    - Убедиться, что `src/bot/` корректно включён в `tsconfig.json`
    - _Requirements: 1.1_

  - [ ]* 10.3 Написать интеграционный тест запуска бота
    - Проверить, что `BotApp` корректно инициализируется с валидным токеном
    - Проверить установку long polling соединения (мок Telegraf)
    - Файл: `src/bot/__tests__/bot-app.test.ts`
    - _Requirements: 1.3, 1.4_

- [x] 11. Final checkpoint — убедиться, что все тесты проходят
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Задачи, помеченные `*`, являются опциональными и могут быть пропущены для ускорения MVP
- Каждая задача ссылается на конкретные требования для трассируемости
- Property-тесты используют fast-check с минимум 100 итерациями
- Unit-тесты используют Vitest с моками Telegraf Context
- `WorkflowAdapter` изолирует бота от деталей реализации `VideoGenerationWorkflow`
- Состояние не персистируется между перезапусками (in-memory Map)
- Retry-логика для Telegram API использует существующий `RetryHelper` из `src/utils/retry-helper.ts`
