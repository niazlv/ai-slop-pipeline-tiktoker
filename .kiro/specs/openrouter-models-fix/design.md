# OpenRouter Models Fix Bugfix Design

## Overview

Исправление проблем с моделями OpenAI и Gemini через OpenRouter путем внедрения прямого Google Gemini API и улучшения системы fallback. Текущая реализация полагается исключительно на OpenRouter для всех моделей генерации текста, что приводит к сбоям когда определенные модели недоступны через эту платформу. Решение включает прямую интеграцию с Google Gemini API, улучшенное логирование ошибок и автоматические fallback механизмы для обеспечения стабильной работы системы.

## Glossary

- **Bug_Condition (C)**: Условие, при котором модели OpenAI или Gemini через OpenRouter не могут выполнить генерацию текста из-за ограничений платформы
- **Property (P)**: Желаемое поведение - успешная генерация текста через прямые API или альтернативные модели
- **Preservation**: Существующая функциональность рабочих моделей OpenRouter и бесплатной генерации, которая должна остаться неизменной
- **TextGeneratorClient**: Класс в `src/api/text-generator-client.ts`, который управляет генерацией текста через различные API
- **OpenRouter**: Платформа-агрегатор для доступа к различным LLM моделям
- **Gemini API**: Прямой API Google для доступа к моделям Gemini
- **Fallback механизм**: Система автоматического переключения на альтернативные модели при сбоях

## Bug Details

### Bug Condition

Баг проявляется когда система пытается использовать модели OpenAI или Gemini через OpenRouter, но эти модели недоступны из-за ограничений платформы. `TextGeneratorClient` не может выполнить генерацию текста, не имеет детального логирования ошибок и не предоставляет fallback механизмы.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { model: string, apiProvider: string }
  OUTPUT: boolean
  
  RETURN (input.model STARTS_WITH "openai/" OR input.model STARTS_WITH "google/")
         AND input.apiProvider == "openrouter"
         AND modelNotAvailableOnOpenRouter(input.model)
END FUNCTION
```

### Examples

- **OpenAI через OpenRouter**: Модель `openai/gpt-5.1` настроена в `OPENROUTER_MODEL`, но OpenRouter не может предоставить доступ к этой модели → генерация текста завершается ошибкой
- **Gemini через OpenRouter**: Модель `google/gemini-pro` используется для генерации, но OpenRouter блокирует доступ → система не может создать варианты историй
- **Отсутствие логирования**: При ошибке API система не предоставляет детальную информацию о причине сбоя → сложно диагностировать проблему
- **Отсутствие fallback**: При сбое основной модели система не переключается на альтернативные рабочие модели → полный отказ функциональности

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Рабочие модели через OpenRouter (например, `x-ai/grok-4.1-fast`) должны продолжать работать точно так же
- Бесплатная генерация должна использовать существующие настройки и модели без изменений
- Форматы ответов для вариантов историй и видео промптов должны остаться идентичными

**Scope:**
Все входные данные, которые НЕ включают проблемные модели OpenAI/Gemini через OpenRouter, должны быть полностью не затронуты этим исправлением. Это включает:
- Использование рабочих моделей OpenRouter
- Бесплатные модели (x-ai/grok-4.1-fast:free)
- Существующие параметры генерации (temperature, max_tokens)

## Hypothesized Root Cause

На основе анализа кода, наиболее вероятные причины:

1. **Ограничения OpenRouter платформы**: OpenRouter не предоставляет доступ к определенным моделям OpenAI и Gemini
   - Модели могут быть недоступны из-за лицензионных ограничений
   - Некоторые новые модели могут не поддерживаться OpenRouter

2. **Отсутствие прямых API интеграций**: Система полагается только на OpenRouter без альтернативных путей доступа
   - Нет прямой интеграции с Google Gemini API
   - Отсутствуют fallback механизмы

3. **Недостаточное логирование ошибок**: Текущая реализация не предоставляет детальную информацию об ошибках API
   - Ошибки не логируются с достаточной детализацией
   - Отсутствует информация о причинах сбоев

4. **Жесткая зависимость от одного провайдера**: Архитектура не предусматривает множественных провайдеров API
   - Нет абстракции для переключения между провайдерами
   - Отсутствует система приоритетов для моделей

## Correctness Properties

Property 1: Bug Condition - Direct API Access for Gemini Models

_For any_ text generation request where a Gemini model is specified (model name contains "gemini" or "google/"), the fixed TextGeneratorClient SHALL use the direct Google Gemini API with the provided API key (AIzaSyAy5JfexmBLO7NsOT_QKiuv-4JbSMeC8DA) instead of OpenRouter, successfully generating text content.

**Validates: Requirements 2.2**

Property 2: Preservation - OpenRouter Working Models Unchanged

_For any_ text generation request using working OpenRouter models (such as x-ai/grok-4.1-fast), the fixed TextGeneratorClient SHALL produce exactly the same results as the original implementation, preserving all existing functionality including response format, timing, and generation quality.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

Предполагая, что наш анализ корневых причин верен:

**File**: `src/api/text-generator-client.ts`

**Function**: `TextGeneratorClient` class

**Specific Changes**:
1. **Добавление Google Gemini API интеграции**: Создать прямое подключение к Google Gemini API
   - Добавить Google AI SDK как зависимость
   - Создать отдельный клиент для Gemini API
   - Реализовать детекцию Gemini моделей

2. **Улучшение системы логирования**: Добавить детальное логирование ошибок API
   - Логировать полные ошибки API с кодами состояния
   - Добавить информацию о используемой модели и провайдере
   - Включить временные метки и контекст запроса

3. **Реализация fallback механизмов**: Создать систему автоматического переключения на альтернативные модели
   - Определить приоритетный список моделей для каждого типа запроса
   - Реализовать автоматическое переключение при сбоях
   - Добавить конфигурацию fallback моделей

4. **Рефакторинг архитектуры провайдеров**: Создать абстракцию для множественных API провайдеров
   - Выделить интерфейс для провайдеров текстовой генерации
   - Реализовать OpenRouter и Gemini провайдеры
   - Добавить логику выбора провайдера на основе модели

5. **Обновление конфигурации**: Добавить новые переменные окружения для Gemini API
   - Добавить GOOGLE_GEMINI_API_KEY в .env
   - Создать конфигурацию fallback моделей
   - Обновить документацию по настройке

## Testing Strategy

### Validation Approach

Стратегия тестирования следует двухфазному подходу: сначала выявить контрпримеры, демонстрирующие баг на неисправленном коде, затем проверить, что исправление работает корректно и сохраняет существующее поведение.

### Exploratory Bug Condition Checking

**Goal**: Выявить контрпримеры, демонстрирующие баг ДО реализации исправления. Подтвердить или опровергнуть анализ корневых причин. Если опровергнем, потребуется пересмотр гипотез.

**Test Plan**: Написать тесты, которые симулируют запросы к проблемным моделям OpenAI и Gemini через OpenRouter. Запустить эти тесты на НЕИСПРАВЛЕННОМ коде для наблюдения сбоев и понимания корневых причин.

**Test Cases**:
1. **OpenAI Model Test**: Попытка генерации с моделью `openai/gpt-5.1` через OpenRouter (будет сбой на неисправленном коде)
2. **Gemini Model Test**: Попытка генерации с моделью `google/gemini-pro` через OpenRouter (будет сбой на неисправленном коде)
3. **Error Logging Test**: Проверка детализации логирования при ошибках API (будет недостаточно информации на неисправленном коде)
4. **No Fallback Test**: Проверка поведения при сбое основной модели (будет полный отказ на неисправленном коде)

**Expected Counterexamples**:
- API запросы к OpenAI/Gemini моделям через OpenRouter завершаются ошибками
- Возможные причины: недоступность моделей на OpenRouter, ограничения лицензирования, неправильная конфигурация API

### Fix Checking

**Goal**: Проверить, что для всех входных данных, где выполняется условие бага, исправленная функция производит ожидаемое поведение.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := TextGeneratorClient_fixed.generateText(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Проверить, что для всех входных данных, где условие бага НЕ выполняется, исправленная функция производит тот же результат, что и оригинальная функция.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT TextGeneratorClient_original.generateText(input) = TextGeneratorClient_fixed.generateText(input)
END FOR
```

**Testing Approach**: Property-based тестирование рекомендуется для проверки сохранения поведения, потому что:
- Оно автоматически генерирует множество тестовых случаев по всему домену входных данных
- Оно выявляет граничные случаи, которые могут пропустить ручные unit тесты
- Оно предоставляет сильные гарантии, что поведение не изменилось для всех не-багованных входных данных

**Test Plan**: Наблюдать поведение на НЕИСПРАВЛЕННОМ коде сначала для рабочих моделей OpenRouter, затем написать property-based тесты, захватывающие это поведение.

**Test Cases**:
1. **Working OpenRouter Models Preservation**: Проверить, что рабочие модели (x-ai/grok-4.1-fast) продолжают работать идентично
2. **Free Model Preservation**: Проверить, что бесплатные модели продолжают использовать существующие настройки
3. **Response Format Preservation**: Проверить, что форматы ответов для вариантов историй остаются неизменными
4. **Generation Parameters Preservation**: Проверить, что параметры генерации (temperature, max_tokens) работают как прежде

### Unit Tests

- Тестирование прямого подключения к Google Gemini API
- Тестирование детекции типа модели (OpenRouter vs Gemini)
- Тестирование fallback механизмов при сбоях API
- Тестирование улучшенного логирования ошибок

### Property-Based Tests

- Генерация случайных описаний историй и проверка успешной генерации через Gemini API
- Генерация случайных конфигураций моделей и проверка сохранения поведения OpenRouter
- Тестирование множественных сценариев fallback для обеспечения стабильности

### Integration Tests

- Тестирование полного потока генерации историй с Gemini API
- Тестирование переключения между провайдерами в зависимости от модели
- Тестирование логирования и мониторинга в реальных условиях использования