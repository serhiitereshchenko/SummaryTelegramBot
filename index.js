require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Database = require('./src/database');
const MessageHandler = require('./src/messageHandler');
const CommandHandler = require('./src/commandHandler');
const Scheduler = require('./src/scheduler');
const logger = require('./src/logger');
const summaryService = require('./src/summaryService');

class TelegramSummaryBot {
  constructor() {
    this.token = process.env.BOT_TOKEN;
    if (!this.token) {
      throw new Error('BOT_TOKEN is required in environment variables');
    }
    
    this.bot = new TelegramBot(this.token, { polling: true });
    this.db = new Database();
    this.summaryService = new summaryService();
    this.messageHandler = new MessageHandler(this.db);
    this.commandHandler = new CommandHandler(this.db, this.summaryService);
    this.scheduler = new Scheduler(this.db, this.bot);
    this.setupErrorHandling();
    this.setupGracefulShutdown();
  }

  setupErrorHandling() {
    this.bot.on('polling_error', (error) => {
      logger.error('Polling error:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });
  }

  setupGracefulShutdown() {
    const shutdown = () => {
      logger.info('Shutting down gracefully...');
      if (this.scheduler) {
        this.scheduler.stop();
      }
      if (this.db) {
        this.db.close();
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  async start() {
    try {
      await this.db.init();
      logger.info('Database initialized successfully');
      
      this.scheduler.start();
      logger.info('Scheduler service started');
      
      logger.info('Using AI provider: OPENAI');
      
      const me = await this.bot.getMe();
      logger.info(`Bot started successfully: @${me.username}`);
      
      console.log(`🤖 Bot @${me.username} is running...`);
      console.log(`🧠 AI Provider: OPENAI`);
      console.log('Available commands:');
      console.log('  /start - Welcome message');
      console.log('  /help - Show help');
      console.log('  /summary [period] - Generate summary');
      console.log('  /language [code] - Set summary language');
      console.log('  /length [number] - Set summary detail level');
      console.log('  /timezone [code] - Set timezone for date formatting');
      console.log('  /schedule [option] - Set automatic summaries');
      console.log('  /stats - Show chat statistics');
      console.log('  /clear - Clear chat history');
      console.log('\n📝 Logs are saved to ./logs/ directory');
      console.log('⏰ Scheduler checks for pending summaries every 5 minutes');
      
      this.setupHandlers();
    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  setupHandlers() {
    // Handle all text messages for storage
    this.bot.on('message', async (msg) => {
      try {
        await this.messageHandler.handleMessage(msg);
      } catch (error) {
        logger.error('Error handling message:', error);
      }
    });

    // Command handlers
    this.bot.onText(/\/start/, (msg) => {
      this.commandHandler.handleStart(this.bot, msg);
    });

    this.bot.onText(/\/help/, (msg) => {
      this.commandHandler.handleHelp(this.bot, msg);
    });

    this.bot.onText(/\/summary(?:\s+(.+))?/, async (msg, match) => {
      try {
        await this.commandHandler.handleSummary(this.bot, msg, match[1]);
      } catch (error) {
        logger.error('Error handling summary command:', error);
        this.bot.sendMessage(msg.chat.id, '❌ Sorry, an error occurred while generating the summary. Please try again later.');
      }
    });

    this.bot.onText(/\/stats/, async (msg) => {
      try {
        await this.commandHandler.handleStats(this.bot, msg);
      } catch (error) {
        logger.error('Error handling stats command:', error);
      }
    });

    this.bot.onText(/\/clear/, async (msg) => {
      try {
        await this.commandHandler.handleClear(this.bot, msg);
      } catch (error) {
        logger.error('Error handling clear command:', error);
      }
    });

    this.bot.onText(/\/language(?:\s+(.+))?/, async (msg, match) => {
      try {
        await this.commandHandler.handleLanguage(this.bot, msg, match[1]);
      } catch (error) {
        logger.error('Error handling language command:', error);
        this.bot.sendMessage(msg.chat.id, '❌ Error setting language preference. Please try again.');
      }
    });

    this.bot.onText(/\/length(?:\s+(.+))?/, async (msg, match) => {
      try {
        await this.commandHandler.handleLength(this.bot, msg, match[1]);
      } catch (error) {
        logger.error('Error handling length command:', error);
        this.bot.sendMessage(msg.chat.id, '❌ Error setting summary length preference. Please try again.');
      }
    });

    this.bot.onText(/\/schedule(?:\s+(.+))?/, async (msg, match) => {
      try {
        await this.commandHandler.handleSchedule(this.bot, msg, match[1]);
      } catch (error) {
        logger.error('Error handling schedule command:', error);
        this.bot.sendMessage(msg.chat.id, '❌ Error setting scheduled summaries. Please try again.');
      }
    });

    this.bot.onText(/\/timezone(?:\s+(.+))?/, async (msg, match) => {
      try {
        await this.commandHandler.handleTimezone(this.bot, msg, match[1]);
      } catch (error) {
        logger.error('Error handling timezone command:', error);
        this.bot.sendMessage(msg.chat.id, '❌ Error setting timezone preference. Please try again.');
      }
    });
  }
}

// Start the bot
if (require.main === module) {
  const bot = new TelegramSummaryBot();
  bot.start();
}

module.exports = TelegramSummaryBot;
