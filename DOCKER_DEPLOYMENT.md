# 🐳 Docker Deployment Guide

This guide will help you deploy the Telegram Summary Bot using Docker.

## 📋 Prerequisites

- Docker and Docker Compose installed
- Telegram Bot Token (from @BotFather)
- OpenAI API Key
- Your Telegram User ID

## 🚀 Quick Deployment

### 1. Clone and Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd telegram-summary-bot

# Copy environment template
cp env.example .env
```

### 2. Configure Environment

Edit the `.env` file with your actual values:

```bash
# Your Telegram Bot Token (get from @BotFather)
BOT_TOKEN=your_actual_bot_token_here

# OpenAI API Key (get from https://platform.openai.com/api-keys)
OPENAI_API_KEY=your_actual_openai_api_key_here

# Bot Owner ID (your Telegram user ID)
BOT_OWNER_ID=your_telegram_user_id_here

# Database path (default: ./chat_data.db)
DATABASE_PATH=./chat_data.db

# Optional: Log level
LOG_LEVEL=info
```

### 3. Test Configuration

```bash
# Run the deployment test
node test-deployment.js
```

### 4. Deploy

```bash
# Use the automated deployment script
./deploy.sh

# Or deploy manually
docker-compose up -d
```

## 🔧 Manual Deployment Steps

If you prefer to deploy manually:

### 1. Build the Image

```bash
docker-compose build --no-cache
```

### 2. Create Directories

```bash
mkdir -p logs data
chmod 755 logs data
```

### 3. Start the Container

```bash
docker-compose up -d
```

### 4. Check Status

```bash
# Check if container is running
docker-compose ps

# View logs
docker-compose logs -f
```

## 📊 Monitoring and Management

### View Logs

```bash
# Follow logs in real-time
docker-compose logs -f

# View recent logs
docker-compose logs --tail=50

# View error logs only
docker-compose logs | grep ERROR
```

### Container Management

```bash
# Restart the bot
docker-compose restart

# Stop the bot
docker-compose down

# Stop and remove volumes (⚠️ This will delete data)
docker-compose down -v

# Update and restart
docker-compose pull
docker-compose up -d
```

### Database Management

```bash
# Access the database inside the container
docker-compose exec telegram-bot sqlite3 /app/data/chat_data.db

# Backup the database
docker-compose exec telegram-bot cp /app/data/chat_data.db /app/data/chat_data_backup.db
docker cp telegram-summary-bot:/app/data/chat_data_backup.db ./backup/

# Restore from backup
docker cp ./backup/chat_data_backup.db telegram-summary-bot:/app/data/chat_data.db
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Container Won't Start

```bash
# Check logs for errors
docker-compose logs

# Check if ports are available
netstat -tulpn | grep :3000
```

#### 2. Database Issues

```bash
# Run migrations manually
docker-compose exec telegram-bot node migrations/init.js
docker-compose exec telegram-bot node migrations/add_timezone_column.js
```

#### 3. Permission Issues

```bash
# Fix permissions
sudo chown -R $USER:$USER logs data
chmod 755 logs data
```

#### 4. Environment Variables

```bash
# Verify environment variables
docker-compose exec telegram-bot env | grep -E "(BOT_TOKEN|OPENAI_API_KEY)"
```

### Health Checks

The container includes health checks. You can monitor them:

```bash
# Check health status
docker-compose ps

# View health check logs
docker inspect telegram-summary-bot | grep -A 10 "Health"
```

## 📁 File Structure

```
telegram-summary-bot/
├── src/                    # Source code
├── migrations/             # Database migrations
├── logs/                   # Log files (mounted volume)
├── data/                   # Database files (mounted volume)
├── Dockerfile              # Docker configuration
├── docker-compose.yml      # Docker Compose configuration
├── deploy.sh               # Automated deployment script
├── test-deployment.js      # Deployment test script
├── env.example             # Environment template
└── .env                    # Your environment variables
```

## 🔒 Security Considerations

1. **Environment Variables**: Never commit your `.env` file to version control
2. **Database**: The database is stored in a Docker volume for persistence
3. **Logs**: Logs are stored in the `logs/` directory on the host
4. **User Permissions**: The container runs as a non-root user for security

## 📈 Scaling

For production deployments, consider:

1. **Reverse Proxy**: Use nginx or traefik for SSL termination
2. **Load Balancing**: If running multiple instances
3. **Monitoring**: Add Prometheus/Grafana for metrics
4. **Backup**: Set up automated database backups
5. **Log Rotation**: Configure log rotation for the logs directory

## 🆘 Support

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Run the test script: `node test-deployment.js`
3. Verify your environment variables
4. Check Docker and Docker Compose versions
5. Ensure all required ports are available

## 📝 Environment Variables Reference

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `BOT_TOKEN` | ✅ | Telegram Bot Token | - |
| `OPENAI_API_KEY` | ✅ | OpenAI API Key | - |
| `BOT_OWNER_ID` | ✅ | Bot Owner User ID | - |
| `DATABASE_PATH` | ❌ | Database file path | `./chat_data.db` |
| `LOG_LEVEL` | ❌ | Logging level | `info` |
| `NODE_ENV` | ❌ | Node environment | `production` |

## 🎯 Success Indicators

Your bot is successfully deployed when:

- ✅ Container shows "Up" status
- ✅ No error messages in logs
- ✅ Bot responds to `/start` command
- ✅ Database file exists in `data/` directory
- ✅ Log files are being created in `logs/` directory 