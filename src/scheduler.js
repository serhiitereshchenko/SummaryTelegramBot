const logger = require('./logger');
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

      // Update next run time
      const now = Math.floor(Date.now() / 1000);
      const nextRun = now + (interval_hours * 3600);
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