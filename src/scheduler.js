const logger = require('./logger');
const moment = require('moment-timezone');
const SummaryService = require('./summaryService');

class Scheduler {
  constructor(database, bot) {
    this.db = database;
    this.bot = bot;
    this.summaryService = new SummaryService();
    this.intervalId = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    logger.info('Starting scheduler service');
    
    // Check every 5 minutes for pending schedules
    this.intervalId = setInterval(() => {
      this.processPendingSchedules();
    }, 5 * 60 * 1000);

    // Run immediately once
    this.processPendingSchedules();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Scheduler service stopped');
  }

  async processPendingSchedules() {
    try {
      const pendingSchedules = await this.db.getPendingSchedules();
      
      if (pendingSchedules.length === 0) {
        return;
      }

      logger.info(`Processing ${pendingSchedules.length} pending schedule(s)`);

      for (const schedule of pendingSchedules) {
        await this.processSchedule(schedule);
      }
    } catch (error) {
      logger.error('Error processing pending schedules:', error);
    }
  }

  async processSchedule(schedule) {
    const { id, chat_id, schedule_type, interval_hours } = schedule;
    
    try {
      logger.info(`Processing schedule ${id} for chat ${chat_id}, type: ${schedule_type}`);

      // Generate summary based on schedule type
      const period = this.getSchedulePeriod(schedule_type);
      const summary = await this.summaryService.generateSummary(chat_id, period, this.db);

      if (summary && summary.trim()) {
        // Send the summary
        const scheduleEmojis = {
          'daily': '📅',
          '3days': '📆',
          'weekly': '🗓️'
        };

        const emoji = scheduleEmojis[schedule_type] || '⏰';
        const message = `${emoji} *Scheduled Summary - ${schedule_type.charAt(0).toUpperCase() + schedule_type.slice(1)}*\n\n${summary}`;
        
        await this.bot.sendMessage(chat_id, message);
        logger.info(`Sent scheduled summary for chat ${chat_id}`);
      } else {
        logger.info(`No content to summarize for chat ${chat_id}, skipping scheduled summary`);
      }

      // Calculate next run time with timezone awareness
      const nextRun = await this.calculateNextRunTime(chat_id, schedule_type, interval_hours);
      await this.db.updateScheduleNextRun(id, nextRun);

    } catch (error) {
      logger.error(`Error processing schedule ${id}:`, error);
      
      // If there's a critical error, deactivate the schedule
      if (error.message.includes('chat not found') || error.message.includes('TELEGRAM')) {
        logger.warn(`Deactivating schedule ${id} due to error: ${error.message}`);
        await this.db.deactivateSchedule(id);
      }
    }
  }

  async calculateNextRunTime(chatId, scheduleType, intervalHours) {
    // Get user's timezone settings
    const settings = await this.db.getChatSettings(chatId);
    const userTimezone = settings.timezone || 'UTC';
    
    const now = moment().tz(userTimezone);
    
    if (scheduleType === 'daily') {
      // Schedule for tomorrow at 9:00 AM in user's timezone
      const next9AM = now.clone().add(1, 'day').hour(9).minute(0).second(0).millisecond(0);
      return Math.floor(next9AM.unix());
    } else if (scheduleType === 'weekly') {
      // Schedule for next Sunday at 9:00 AM in user's timezone
      const nextSunday = now.clone().add(1, 'week').day(0).hour(9).minute(0).second(0).millisecond(0);
      return Math.floor(nextSunday.unix());
    } else {
      // For custom schedules, just add the interval
      const futureTime = now.clone().add(intervalHours, 'hours');
      return Math.floor(futureTime.unix());
    }
  }

  getSchedulePeriod(scheduleType) {
    switch (scheduleType) {
      case 'daily':
        return '24h';
      case '3days':
        return '3d';
      case 'weekly':
        return '1w';
      default:
        return '24h';
    }
  }
}

module.exports = Scheduler; 