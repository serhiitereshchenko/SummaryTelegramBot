# ✅ Deployment Checklist

Use this checklist to ensure your Telegram Summary Bot is ready for deployment.

## 🔧 Pre-Deployment Checklist

### Environment Setup
- [ ] `.env` file created from `env.example`
- [ ] `BOT_TOKEN` configured with valid Telegram bot token
- [ ] `OPENAI_API_KEY` configured with valid OpenAI API key
- [ ] `BOT_OWNER_ID` set to your Telegram user ID
- [ ] `DATABASE_PATH` set (default: `./chat_data.db`)

### System Requirements
- [ ] Docker installed and running
- [ ] Docker Compose installed
- [ ] At least 1GB free disk space
- [ ] Internet connection for Docker image pulls

### File Verification
- [ ] All source files present in `src/` directory
- [ ] Migration files present in `migrations/` directory
- [ ] `Dockerfile` and `docker-compose.yml` present
- [ ] `package.json` with correct dependencies
- [ ] `index.js` as main entry point

## 🧪 Testing Checklist

### Run Pre-Deployment Tests
```bash
# Test deployment configuration
node test-deployment.js
```

Expected output:
- ✅ All files present
- ✅ Dependencies correct
- ✅ Docker configuration valid
- ✅ Environment variables configured
- ✅ Docker available

### Manual Verification
- [ ] Bot token is valid (test with curl or browser)
- [ ] OpenAI API key is valid (test with curl)
- [ ] Your Telegram user ID is correct
- [ ] No syntax errors in source code

## 🚀 Deployment Steps

### 1. Initial Setup
```bash
# Create necessary directories
mkdir -p logs data
chmod 755 logs data

# Copy environment template (if not done)
cp env.example .env
# Edit .env with your values
```

### 2. Build and Deploy
```bash
# Option A: Use automated script
./deploy.sh

# Option B: Manual deployment
docker-compose build --no-cache
docker-compose up -d
```

### 3. Verify Deployment
```bash
# Check container status
docker-compose ps

# Check logs
docker-compose logs --tail=20

# Test bot functionality
# Send /start to your bot in Telegram
```

## ✅ Post-Deployment Verification

### Container Status
- [ ] Container shows "Up" status
- [ ] No error messages in logs
- [ ] Health checks passing

### Bot Functionality
- [ ] Bot responds to `/start` command
- [ ] Bot responds to `/help` command
- [ ] Database file created in `data/` directory
- [ ] Log files being created in `logs/` directory

### Database Verification
- [ ] Database initialized successfully
- [ ] Timezone column migration completed
- [ ] No database errors in logs

### AI Integration
- [ ] OpenAI API calls working
- [ ] Summary generation functional
- [ ] No API key errors

## 🔍 Troubleshooting

### Common Issues and Solutions

#### Container Won't Start
```bash
# Check logs
docker-compose logs

# Check environment variables
docker-compose exec telegram-bot env | grep -E "(BOT_TOKEN|OPENAI_API_KEY)"
```

#### Database Issues
```bash
# Run migrations manually
docker-compose exec telegram-bot node migrations/init.js
docker-compose exec telegram-bot node migrations/add_timezone_column.js
```

#### Permission Issues
```bash
# Fix permissions
sudo chown -R $USER:$USER logs data
chmod 755 logs data
```

#### Bot Not Responding
- Verify bot token is correct
- Check if bot is added to chat
- Verify bot has necessary permissions
- Check logs for error messages

## 📊 Monitoring Commands

### Useful Commands for Monitoring
```bash
# Follow logs in real-time
docker-compose logs -f

# Check container health
docker-compose ps

# View recent logs
docker-compose logs --tail=50

# Check database size
docker-compose exec telegram-bot ls -lh /app/data/

# Check log file sizes
ls -lh logs/
```

## 🔄 Maintenance

### Regular Maintenance Tasks
- [ ] Monitor log file sizes
- [ ] Check database size
- [ ] Verify bot functionality
- [ ] Update dependencies periodically
- [ ] Backup database regularly

### Update Process
```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## 🆘 Emergency Procedures

### Bot Not Working
1. Check logs: `docker-compose logs -f`
2. Restart container: `docker-compose restart`
3. Check environment variables
4. Verify API keys are still valid

### Database Issues
1. Check database file: `ls -la data/`
2. Run migrations: `docker-compose exec telegram-bot node migrations/init.js`
3. Restore from backup if necessary

### Container Issues
1. Stop container: `docker-compose down`
2. Remove old images: `docker system prune -f`
3. Rebuild: `docker-compose build --no-cache`
4. Start: `docker-compose up -d`

## 📞 Support

If you need help:
1. Check this checklist first
2. Review the logs: `docker-compose logs -f`
3. Run the test script: `node test-deployment.js`
4. Check the troubleshooting section in `DOCKER_DEPLOYMENT.md`

## 🎯 Success Criteria

Your deployment is successful when:
- ✅ Container runs without errors
- ✅ Bot responds to commands
- ✅ Summaries are generated correctly
- ✅ Database persists data
- ✅ Logs are being written
- ✅ All features work as expected 