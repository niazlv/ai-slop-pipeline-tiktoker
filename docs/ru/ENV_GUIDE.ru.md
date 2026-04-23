# Руководство по настройке .env

## Структура файла

```.env
# ============================================
# FAL.AI SETTINGS
# ============================================

FAL_API_KEY="your_fal_api_key"

# Image Generation Models
FAL_IMAGE_MODEL="fal-ai/flux/schnell"
FAL_IMAGE_MODEL_FREE="fal-ai/flux-lora"

# Video Generation Models
FAL_VIDEO_MODEL="fal-ai/veo3.1/fast/image-to-video"
FAL_VIDEO_MODEL_FREE="fal-ai/bytedance/seedance/v1/lite/text-to-video"

# ============================================
# OPENROUTER SETTINGS
# ============================================

OPENROUTER_API_KEY="your_openrouter_api_key"

# Text Generation Models
OPENROUTER_MODEL="openai/chatgpt"
OPENROUTER_MODEL_FREE="x-ai/grok-4.1-fast:free"

# ============================================
# GOOGLE GEMINI SETTINGS
# ============================================

GOOGLE_GEMINI_API_KEY="your_google_gemini_api_key"

# ============================================
# FALLBACK MODEL CONFIGURATION
# ============================================

# Основные модели для генерации историй (через запятую)
FALLBACK_STORY_PRIMARY="openai/gpt-4,google/gemini-pro"

# Резервные модели для генерации историй (через запятую)
FALLBACK_STORY_FALLBACK="x-ai/grok-4.1-fast,anthropic/claude-3-haiku"

# Максимальное количество попыток для механизмов fallback
FALLBACK_MAX_RETRIES="3"

# ============================================
# LANGUAGE SETTINGS
# ============================================

LANGUAGE="en"
```

## Переменные окружения

### FAL.AI

#### FAL_API_KEY
- **Обязательно:** Да
- **Описание:** API ключ для FAL.AI
- **Как получить:** https://fal.ai/dashboard

#### FAL_IMAGE_MODEL
- **Обязательно:** Нет
- **По умолчанию:** `fal-ai/flux/schnell`
- **Описание:** Модель для генерации изображений (обычный режим)
- **Рекомендации:**
  - `fal-ai/flux/schnell` - быстрая, хорошее качество
  - `fal-ai/flux/dev` - медленнее, лучшее качество
  - `fal-ai/flux-pro` - максимальное качество (дорого)

#### FAL_IMAGE_MODEL_FREE
- **Обязательно:** Нет
- **По умолчанию:** `fal-ai/flux-lora`
- **Описание:** Модель для генерации изображений (бесплатный режим)
- **Рекомендации:**
  - `fal-ai/flux-lora` - бесплатная альтернатива Flux

#### FAL_VIDEO_MODEL
- **Обязательно:** Нет
- **По умолчанию:** `fal-ai/veo3.1/fast/image-to-video`
- **Описание:** Модель для генерации видео (обычный режим)
- **Рекомендации:**
  - `fal-ai/veo3.1/fast/image-to-video` - быстро, хорошее качество
  - `fal-ai/veo3.1/image-to-video` - медленнее, лучшее качество

#### FAL_VIDEO_MODEL_FREE
- **Обязательно:** Нет
- **По умолчанию:** `fal-ai/bytedance/seedance/v1/lite/text-to-video`
- **Описание:** Модель для генерации видео (бесплатный режим)
- **Рекомендации:**
  - `fal-ai/bytedance/seedance/v1/lite/text-to-video` - бесплатная альтернатива

### OpenRouter

#### OPENROUTER_API_KEY
- **Обязательно:** Да
- **Описание:** API ключ для OpenRouter
- **Как получить:** https://openrouter.ai/keys

#### OPENROUTER_MODEL
- **Обязательно:** Нет
- **По умолчанию:** `openai/chatgpt`
- **Описание:** Модель для генерации текста (обычный режим)
- **Рекомендации:**
  - `openai/chatgpt` - быстро, хорошее качество
  - `anthropic/claude-3.5-sonnet` - лучшее качество текста
  - `google/gemini-2.0-flash` - быстро, дешево

#### OPENROUTER_MODEL_FREE
- **Обязательно:** Нет
- **По умолчанию:** `x-ai/grok-4.1-fast:free`
- **Описание:** Модель для генерации текста (бесплатный режим)
- **Рекомендации:**
  - `x-ai/grok-4.1-fast:free` - полностью бесплатно
  - `google/gemini-2.0-flash:free` - также бесплатно

### Google Gemini

#### GOOGLE_GEMINI_API_KEY
- **Обязательно:** Нет (но рекомендуется для надежности)
- **Описание:** Прямой API ключ для моделей Google Gemini
- **Как получить:** https://aistudio.google.com/app/apikey
- **Назначение:** Обеспечивает прямой доступ к моделям Gemini, обходя ограничения OpenRouter
- **Преимущества:**
  - Более надежный доступ к моделям Gemini
  - Лучшая обработка ошибок и логирование
  - Автоматический fallback при сбоях Gemini моделей в OpenRouter

### Конфигурация резервных моделей

Система включает интеллектуальные механизмы fallback, которые автоматически переключаются на альтернативные модели при сбое основной модели:

#### FALLBACK_STORY_PRIMARY
- **Обязательно:** Нет
- **По умолчанию:** `openai/gpt-4,google/gemini-pro,anthropic/claude-3-sonnet`
- **Описание:** Основные модели для генерации историй (через запятую)
- **Назначение:** Эти модели пробуются первыми для генерации текста

#### FALLBACK_STORY_FALLBACK
- **Обязательно:** Нет
- **По умолчанию:** `x-ai/grok-4.1-fast,anthropic/claude-3-haiku,meta-llama/llama-3.1-8b-instruct`
- **Описание:** Резервные модели для генерации историй (через запятую)
- **Назначение:** Используются при сбое основных моделей

#### FALLBACK_MAX_RETRIES
- **Обязательно:** Нет
- **По умолчанию:** `3`
- **Описание:** Максимальное количество попыток для механизмов fallback
- **Диапазон:** 1-5 (рекомендуется: 2-3)

### Язык интерфейса

#### LANGUAGE
- **Обязательно:** Нет
- **По умолчанию:** `en`
- **Описание:** Язык интерфейса приложения
- **Доступные значения:**
  - `en` - English (английский)
  - `ru` - Русский
- **Примечание:** Код в базе данных и логи всегда на английском языке. Эта настройка влияет только на UI (пользовательский интерфейс).

## Система резервирования и надежность

### Как работает fallback

Система включает интеллектуальные механизмы резервирования, которые автоматически переключаются на альтернативные модели при сбое основной модели. Это обеспечивает надежную генерацию текста даже когда определенные модели недоступны.

**Последовательность fallback:**
1. **Основная модель** - Ваша настроенная `OPENROUTER_MODEL` или `OPENROUTER_MODEL_FREE`
2. **Основные резервы** - Модели из списка `FALLBACK_STORY_PRIMARY`
3. **Вторичные резервы** - Модели из списка `FALLBACK_STORY_FALLBACK`

**Пример работы fallback:**
```
openai/gpt-4 (сбой) → google/gemini-pro (сбой) → x-ai/grok-4.1-fast (успех) ✅
```

### Прямой API Google Gemini

Когда вы настраиваете `GOOGLE_GEMINI_API_KEY`, система может обходить ограничения OpenRouter и подключаться напрямую к API Google Gemini:

**Преимущества:**
- **Высокая надежность** - Прямой доступ к API более стабилен чем прокси OpenRouter
- **Лучшая обработка ошибок** - Подробные сообщения об ошибках и логирование
- **Автоматическое определение** - Система автоматически использует прямой API для моделей Gemini
- **Плавный fallback** - Переключается на OpenRouter если прямой API недоступен

**Поддерживаемые модели:**
- `google/gemini-pro`
- `google/gemini-1.5-pro`
- `gemini-pro` (сокращенная форма)

## Переключение между режимами

### Обычный режим
```bash
npm run dev
```
Использует: `FAL_IMAGE_MODEL`, `FAL_VIDEO_MODEL`, `OPENROUTER_MODEL`

### Бесплатный режим
```bash
npm run dev -- --free
```
Использует: `FAL_IMAGE_MODEL_FREE`, `FAL_VIDEO_MODEL_FREE`, `OPENROUTER_MODEL_FREE`

## Сравнение стоимости

### Обычный режим (60 сек видео)
- Текст (3 варианта): $0.02
- Промпты: $0.01
- Изображения (10 шт): $0.10
- Видео (10 × 6 сек): $2.00
- Аудио: $0.05
**Итого: ~$2.18**

### Бесплатный режим (60 сек видео)
- Текст (3 варианта): $0.00 (Grok Free)
- Промпты: $0.00 (Grok Free)
- Изображения (10 шт): $0.10 (Flux LoRA дешевле)
- Видео (10 × 6 сек): $0.30 (Seedance дешевле)
- Аудио: $0.05
**Итого: ~$0.45**

**Экономия: ~80%** 💰

## Примеры конфигураций

### Максимальное качество (дорого)
```env
FAL_IMAGE_MODEL="fal-ai/flux-pro"
FAL_VIDEO_MODEL="fal-ai/veo3.1/image-to-video"
OPENROUTER_MODEL="anthropic/claude-3.5-sonnet"
```

### Баланс качества и цены
```env
FAL_IMAGE_MODEL="fal-ai/flux/schnell"
FAL_VIDEO_MODEL="fal-ai/veo3.1/fast/image-to-video"
OPENROUTER_MODEL="openai/chatgpt"
```

### Максимальная экономия
```env
FAL_IMAGE_MODEL_FREE="fal-ai/flux-lora"
FAL_VIDEO_MODEL_FREE="fal-ai/bytedance/seedance/v1/lite/text-to-video"
OPENROUTER_MODEL_FREE="x-ai/grok-4.1-fast:free"
```
