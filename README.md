# Telegram Chat Summary Bot

A production-ready Telegram bot that creates AI-powered summaries of chat conversations using OpenAI (ChatGPT).

## 🚀 Features

- **Smart Summarization**: Uses OpenAI GPT to create intelligent summaries
- **Flexible Time Periods**: Supports hours, days, weeks, or specific dates
- **Real-time Collection**: Automatically stores messages as they're sent
- **Production Ready**: Comprehensive error handling, logging, and monitoring
- **Privacy Focused**: Only stores text messages, no media or sensitive data
- **Multi-chat Support**: Works in groups, channels, and private chats
- **Scheduled Summaries**: Automatic periodic summaries (daily, 3-day, weekly)
- **Docker Ready**: Complete Docker deployment with automatic migrations

## 📋 Commands

- `/summary [period]` - Generate summary for time period
  - `/summary` - Last 24 hours (default)
  - `/summary 12h` - Last 12 hours
  - `/summary 3d` - Last 3 days
  - `/summary 1w` - Last 1 week
  - `/summary today` - Today only
  - `/summary yesterday` - Yesterday only
- `/stats` - Show chat statistics
- `/clear` - Clear stored chat history
- `/help` - Show help message
- `/language [code]` - Set summary language (en, es, fr, de, etc.)
- `/length [number]` - Set summary detail level (500-3000 characters)
- `/timezone [zone]` - Set timezone for date formatting
- `/schedule [option]` - Set up automatic summaries
  - `/schedule daily` - Daily summaries (every 24 hours)
  - `/schedule 3days` - Summaries every 3 days
  - `/schedule weekly` - Weekly summaries (every 7 days)
  - `/schedule off` - Cancel all scheduled summaries

## 🐳 Docker Deployment (Recommended)

### Quick Start with Docker

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd telegram-summary-bot

# 2. Copy environment template
cp env.example .env

# 3. Edit .env with your values
# BOT_TOKEN=your_bot_token
# OPENAI_API_KEY=your_openai_key
# BOT_OWNER_ID=your_user_id

# 4. Test configuration
node test-deployment.js

# 5. Deploy
./deploy.sh
```

### Manual Docker Deployment

```bash
# Build and start
docker-compose build --no-cache
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f
```

For detailed Docker deployment instructions, see [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md).

## 🛠 Manual Setup Instructions

### 1. Prerequisites

- Node.js 16.0.0 or higher
- npm or yarn package manager
- Telegram Bot Token (from @BotFather)
- OpenAI API Key

### 2. Installation

```bash
# Clone or download the project
cd telegram-summary-bot

# Install dependencies and setup database
npm run setup

# Or install manually:
npm install
npm run migrate
```

### 3. Configuration

Create a `.env` file with your API keys:

```env
# Copy from env.example and fill in your values
BOT_TOKEN=your_telegram_bot_token_here
OPENAI_API_KEY=your_openai_api_key_here
BOT_OWNER_ID=your_telegram_user_id_here
DATABASE_PATH=./chat_data.db
LOG_LEVEL=info
NODE_ENV=production
```

### 4. Getting API Keys

**Telegram Bot Token:**
1. Message @BotFather on Telegram
2. Send `/newbot` and follow instructions
3. Copy the bot token provided

**OpenAI API Key:**
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy the key (starts with `sk-`)

**Your Telegram User ID:**
1. Send a message to @userinfobot on Telegram
2. It will reply with your user ID number
3. Copy the ID and add it to `BOT_OWNER_ID`

### 5. Running the Bot

```bash
# Production mode
npm start

# Development mode (with auto-restart)
npm run dev
```

## 📁 Project Structure

```
telegram-summary-bot/
├── src/
│   ├── database.js          # SQLite database management
│   ├── summaryService.js    # OpenAI integration
│   ├── messageHandler.js    # Message processing
│   ├── commandHandler.js    # Bot commands
│   ├── scheduler.js         # Scheduled summaries service
│   └── logger.js           # Winston logging
├── migrations/
│   ├── init.js             # Database initialization
│   └── add_timezone_column.js # Timezone migration
├── logs/                   # Log files
├── data/                   # Database files (Docker)
├── index.js               # Main application
├── package.json
├── env.example            # Environment template
├── Dockerfile             # Docker configuration
├── docker-compose.yml     # Docker Compose configuration
├── deploy.sh              # Automated deployment script
├── test-deployment.js     # Deployment test script
└── README.md
```

## 🔧 Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `BOT_TOKEN` | Telegram bot token | Required |
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `BOT_OWNER_ID` | Bot owner user ID | Required |
| `DATABASE_PATH` | SQLite database file path | `./chat_data.db` |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | `info` |
| `NODE_ENV` | Environment (development/production) | `production` |

### Admin Configuration

The bot supports multiple admin IDs to control who can configure bot settings in groups:

**Setting Admin IDs:**
```bash
# Edit .env file manually:
BOT_OWNER_ID=123456789,987654321,555666777
```

**Admin Permissions:**
- Only admins can use `/language`, `/length`, `/schedule` commands in groups
- Bot owner can always use all commands in private chats
- Leave `BOT_OWNER_ID` empty to allow anyone to configure the bot
- Multiple admin IDs are separated by commas (no spaces)

**Example Configuration:**
```env
# Single admin
BOT_OWNER_ID=123456789

# Multiple admins
BOT_OWNER_ID=123456789,987654321,555666777

# No restrictions (anyone can configure)
BOT_OWNER_ID=
```

## 🚨 Important Notes

### Privacy & Security
- The bot only stores text messages, no media files
- Messages are stored locally in SQLite database
- Data sent to OpenAI for processing
- Add the bot as admin in groups to collect messages

### AI Provider
- **OpenAI (Paid)**: Best quality, API costs apply, rate limits

### Scheduled Summaries
- The bot checks for pending scheduled summaries every 5 minutes
- Scheduled summaries are sent automatically at the specified intervals
- Multiple schedules per chat are not supported (new schedule replaces old one)
- If a chat has no new messages, the scheduled summary will be skipped

### Production Deployment
- Use environment variables for sensitive data
- Set up log rotation for production environments
- Monitor logs in `./logs/` directory
- Use Docker for easy deployment and management

## 🐛 Troubleshooting

### Common Issues

**Bot not responding:**
- Check if BOT_TOKEN is correct
- Ensure bot is added to the chat
- Check logs in `./logs/error.log`

**Summary generation fails:**
- Verify OPENAI_API_KEY is valid
- Check OpenAI account has credits
- Review rate limits

**Database errors:**
- Run `npm run migrate` to reinitialize
- Check file permissions for database file
- Ensure SQLite3 is properly installed

**Docker issues:**
- Check logs: `docker-compose logs -f`
- Verify environment variables: `docker-compose exec telegram-bot env`
- Run test script: `node test-deployment.js`

### Getting Help

1. Check the logs: `tail -f logs/combined.log`
2. Verify environment variables are set correctly
3. Test with a simple `/start` command first
4. Ensure all dependencies are installed: `npm install`
5. For Docker: Check `docker-compose logs -f`

## 📈 Monitoring

The bot includes comprehensive logging:
- `logs/error.log` - Error messages only
- `logs/combined.log` - All log messages
- Console output in development mode

Monitor these files to track bot performance and troubleshoot issues.

## 🔄 Updates & Maintenance

### Manual Updates
```bash
# Backup your .env file and database
# Download the latest version
npm install
npm run migrate
# Restart the bot
```

### Docker Updates
```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## 📝 License

MIT License - feel free to modify and distribute.

## 🎯 Quick Start Summary

1. **Get API Keys**: Telegram Bot Token + OpenAI API Key
2. **Configure**: Copy `env.example` to `.env` and fill in your values
3. **Deploy**: Run `./deploy.sh` for Docker or `npm start` for manual
4. **Test**: Send `/start` to your bot in Telegram

**🎯 This is a complete, production-ready project with Docker support!**
