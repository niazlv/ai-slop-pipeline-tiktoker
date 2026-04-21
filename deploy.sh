#!/bin/bash

# Telegram Bot Deployment Script
# Usage: ./deploy.sh

set -e

SERVER="root@nl-8.sorewa.ru"
REMOTE_DIR="/opt/tiktoker-bot"
SERVICE_NAME="tiktoker-bot"

echo "🚀 Starting deployment to $SERVER..."

# Stop bot if running
echo "📦 Stopping bot service..."
ssh $SERVER "systemctl stop $SERVICE_NAME || true"

# Create remote directory
echo "📁 Creating remote directory..."
ssh $SERVER "mkdir -p $REMOTE_DIR"

# Build project locally
echo "🔨 Building project..."
npm run build

# Copy files to server
echo "📤 Uploading files..."
rsync -avz --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='output' \
  --exclude='.kiro' \
  --exclude='*.log' \
  ./ $SERVER:$REMOTE_DIR/

# Install dependencies and setup on server
echo "⚙️ Setting up on server..."
ssh $SERVER << 'EOF'
cd /opt/tiktoker-bot

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Install dependencies
echo "Installing dependencies..."
npm ci --production

# Install ffmpeg if not present
if ! command -v ffmpeg &> /dev/null; then
    echo "Installing ffmpeg..."
    apt-get update
    apt-get install -y ffmpeg
fi

# Create systemd service
echo "Creating systemd service..."
cat > /etc/systemd/system/tiktoker-bot.service << 'SERVICE'
[Unit]
Description=Tiktoker Telegram Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/tiktoker-bot
ExecStart=/usr/bin/node dist/bot/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=tiktoker-bot

[Install]
WantedBy=multi-user.target
SERVICE

# Reload systemd and enable service
systemctl daemon-reload
systemctl enable tiktoker-bot

# Start the service
echo "Starting bot service..."
systemctl start tiktoker-bot

# Check status
sleep 2
systemctl status tiktoker-bot --no-pager
EOF

echo "✅ Deployment completed!"
echo "📊 Service status:"
ssh $SERVER "systemctl is-active tiktoker-bot"

echo ""
echo "🔧 Useful commands:"
echo "  Check logs: ssh $SERVER 'journalctl -u tiktoker-bot -f'"
echo "  Restart:    ssh $SERVER 'systemctl restart tiktoker-bot'"
echo "  Stop:       ssh $SERVER 'systemctl stop tiktoker-bot'"
echo "  Status:     ssh $SERVER 'systemctl status tiktoker-bot'"