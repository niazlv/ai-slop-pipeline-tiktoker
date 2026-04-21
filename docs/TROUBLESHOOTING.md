# 🔧 Устранение неполадок Telegram бота

## 🚨 Текущая проблема: Недостаточно средств на FAL.AI

### Симптомы
- Бот генерирует сценарий и промпты успешно
- При генерации видео появляется ошибка: "Failed to generate any videos"
- В логах: "API access forbidden" или "Exhausted balance"

### Причина
У аккаунта FAL.AI закончился баланс для генерации видео.

### Решение

#### 1. Пополнение баланса (Рекомендуется)
1. Перейдите на [fal.ai/dashboard/billing](https://fal.ai/dashboard/billing)
2. Войдите с аккаунтом, связанным с API ключом
3. Пополните баланс на $10-20 для тестирования
4. Бот автоматически заработает после пополнения

#### 2. Альтернативный API ключ
Если у вас есть другой FAL.AI аккаунт:
1. Получите новый API ключ на [fal.ai/dashboard](https://fal.ai/dashboard)
2. Обновите `.env` файл на сервере:
   ```bash
   ssh root@nl-8.sorewa.ru
   cd /opt/tiktoker-bot
   nano .env
   # Измените FAL_API_KEY на новый ключ
   systemctl restart tiktoker-bot
   ```

#### 3. Временное отключение (Крайняя мера)
Если нужно временно отключить бота:
```bash
ssh root@nl-8.sorewa.ru
systemctl stop tiktoker-bot
```

## 📊 Мониторинг баланса

### Проверка текущего баланса
```bash
curl -H "Authorization: Key YOUR_FAL_API_KEY" \
     "https://fal.run/fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video" \
     -X POST -H "Content-Type: application/json" \
     -d '{"prompt": "test", "image_url": "https://example.com/test.jpg"}' \
     --max-time 5
```

**Ответы:**
- `{"detail": "User is locked. Reason: Exhausted balance..."}` - Баланс исчерпан
- Другой ответ - Баланс есть

### Автоматический мониторинг
Создайте скрипт для регулярной проверки:

```bash
#!/bin/bash
# check-balance.sh

API_KEY="your_fal_api_key"
RESPONSE=$(curl -s -H "Authorization: Key $API_KEY" \
               "https://fal.run/fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video" \
               -X POST -H "Content-Type: application/json" \
               -d '{"prompt": "test", "image_url": "https://example.com/test.jpg"}' \
               --max-time 5)

if echo "$RESPONSE" | grep -q "Exhausted balance"; then
    echo "⚠️  ВНИМАНИЕ: Баланс FAL.AI исчерпан!"
    echo "Пополните баланс на fal.ai/dashboard/billing"
else
    echo "✅ Баланс FAL.AI в порядке"
fi
```

## 🔍 Диагностика других проблем

### Проблемы с запуском бота

#### Бот не запускается
```bash
# Проверить статус
./monitor-bot.sh status

# Посмотреть логи
./monitor-bot.sh logs

# Перезапустить
./monitor-bot.sh restart
```

#### Ошибки модулей
```bash
ssh root@nl-8.sorewa.ru
cd /opt/tiktoker-bot
npm install
npm run build:bot
node fix-imports.js
systemctl restart tiktoker-bot
```

### Проблемы с API

#### OpenRouter API (текст)
```bash
curl -H "Authorization: Bearer YOUR_OPENROUTER_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model": "x-ai/grok-4.1-fast", "messages": [{"role": "user", "content": "test"}]}' \
     "https://openrouter.ai/api/v1/chat/completions"
```

#### ElevenLabs API (аудио)
Проверяется через FAL.AI, так как используется их прокси.

### Проблемы с генерацией

#### Контент нарушает политику
- Измените описание видео
- Избегайте спорного контента
- Используйте более нейтральные формулировки

#### Таймауты
- Проверьте интернет соединение сервера
- Увеличьте таймауты в коде (по умолчанию 300 попыток × 2 сек = 10 минут)

## 📱 Пользовательские проблемы

### Бот не отвечает
1. Проверьте статус бота: `./monitor-bot.sh status`
2. Проверьте логи: `./monitor-bot.sh logs`
3. Перезапустите при необходимости: `./monitor-bot.sh restart`

### Генерация зависла
1. Пользователь может использовать `/status` для проверки
2. При необходимости `/cancel` для отмены
3. Попробовать снова с другим описанием

### Плохое качество видео
- Используйте более детальные описания
- Попробуйте премиум модели (если есть баланс)
- Экспериментируйте с разными стилями описания

## 🛠️ Инструменты диагностики

### Скрипты мониторинга
```bash
# Статус бота
./monitor-bot.sh status

# Логи
./monitor-bot.sh logs

# Мониторинг в реальном времени
./monitor-bot.sh tail

# Перезапуск
./monitor-bot.sh restart

# Развертывание обновлений
./monitor-bot.sh deploy
```

### Проверка API ключей
```bash
# Проверить FAL.AI
curl -H "Authorization: Key $FAL_API_KEY" "https://fal.run/fal-ai/flux/schnell" \
     -X POST -d '{"prompt": "test"}' -H "Content-Type: application/json"

# Проверить OpenRouter
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
     "https://openrouter.ai/api/v1/models"
```

## 📞 Поддержка

### Логи для отладки
При обращении в поддержку приложите:
```bash
# Статус сервиса
systemctl status tiktoker-bot

# Последние логи
journalctl -u tiktoker-bot --lines=50

# Версия Node.js
node --version

# Содержимое .env (без ключей!)
cat .env | sed 's/=.*/=***/'
```

### Контакты
- **Техническая поддержка**: Через GitHub Issues
- **Срочные проблемы**: Telegram @username
- **Документация**: docs/ папка в репозитории

## 🔄 Регулярное обслуживание

### Еженедельно
- Проверить баланс FAL.AI
- Просмотреть логи на ошибки
- Обновить зависимости при необходимости

### Ежемесячно
- Проверить обновления API
- Оптимизировать производительность
- Резервное копирование конфигурации

### При проблемах
- Сначала проверить баланс API
- Затем статус сервиса
- Потом логи ошибок
- В крайнем случае - полный перезапуск