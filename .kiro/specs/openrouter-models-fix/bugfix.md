# Bugfix Requirements Document

## Introduction

Исправление проблем с моделями OpenAI и Gemini через OpenRouter, которые не работают из-за ограничений платформы. Необходимо внедрить прямой Google Gemini API для обеспечения стабильной работы платных моделей генерации текста.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN используются модели OpenAI через OpenRouter THEN система не может выполнить генерацию текста из-за ограничений OpenRouter

1.2 WHEN используются модели Gemini через OpenRouter THEN система не может выполнить генерацию текста из-за ограничений OpenRouter

1.3 WHEN происходит ошибка с моделями OpenRouter THEN в логах отсутствует детальная информация о причинах сбоя

### Expected Behavior (Correct)

2.1 WHEN используются модели OpenAI через OpenRouter THEN система SHALL использовать альтернативный прямой API или переключиться на рабочие модели

2.2 WHEN используются модели Gemini THEN система SHALL использовать прямой Google Gemini API (AIzaSyAy5JfexmBLO7NsOT_QKiuv-4JbSMeC8DA) для генерации текста

2.3 WHEN происходят ошибки с API THEN система SHALL логировать детальную информацию об ошибках для диагностики

### Unchanged Behavior (Regression Prevention)

3.1 WHEN используются рабочие модели через OpenRouter (например, x-ai/grok-4.1-fast) THEN система SHALL CONTINUE TO работать без изменений

3.2 WHEN используется бесплатная генерация THEN система SHALL CONTINUE TO использовать существующие настройки и модели

3.3 WHEN генерируются варианты историй и видео промпты THEN система SHALL CONTINUE TO возвращать результаты в том же формате