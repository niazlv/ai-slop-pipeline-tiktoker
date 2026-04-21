#!/bin/bash

# Скрипт для мониторинга Telegram бота
# Использование: ./monitor-bot.sh [команда]

SERVER="root@nl-8.sorewa.ru"
SERVICE="tiktoker-bot"

case "$1" in
    "status")
        echo "🔍 Проверка статуса бота..."
        ssh $SERVER "systemctl status $SERVICE --no-pager"
        ;;
    "logs")
        echo "📋 Последние логи бота..."
        ssh $SERVER "journalctl -u $SERVICE --lines=20 --no-pager"
        ;;
    "tail")
        echo "📡 Мониторинг логов в реальном времени (Ctrl+C для выхода)..."
        ssh $SERVER "journalctl -u $SERVICE -f"
        ;;
    "restart")
        echo "🔄 Перезапуск бота..."
        ssh $SERVER "systemctl restart $SERVICE"
        echo "✅ Бот перезапущен"
        ;;
    "deploy")
        echo "🚀 Развертывание обновлений..."
        ./deploy.sh
        ;;
    *)
        echo "🤖 Мониторинг Telegram бота"
        echo ""
        echo "Доступные команды:"
        echo "  status   - проверить статус бота"
        echo "  logs     - показать последние логи"
        echo "  tail     - мониторинг логов в реальном времени"
        echo "  restart  - перезапустить бота"
        echo "  deploy   - развернуть обновления"
        echo ""
        echo "Пример: ./monitor-bot.sh status"
        ;;
esac