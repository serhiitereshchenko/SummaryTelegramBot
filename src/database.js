const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const moment = require('moment-timezone');
const logger = require('./logger');

class Database {
  constructor() {
    this.dbPath = process.env.DATABASE_PATH || './chat_data.db';
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error('Database connection error:', err);
          reject(err);
        } else {
          logger.info('Connected to SQLite database');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    const createMessagesTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        chat_id INTEGER NOT NULL,
        user_id INTEGER,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        text TEXT,
        timestamp INTEGER NOT NULL,
        message_type TEXT DEFAULT 'text',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createChatSettingsTable = `
      CREATE TABLE IF NOT EXISTS chat_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL UNIQUE,
        language TEXT DEFAULT 'en',
        summary_length INTEGER DEFAULT 1500,
        timezone TEXT DEFAULT 'UTC',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createSchedulesTable = `
      CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        schedule_type TEXT NOT NULL,
        interval_hours INTEGER NOT NULL,
        next_run INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createSummaryLogsTable = `
      CREATE TABLE IF NOT EXISTS summary_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        summary_date DATE NOT NULL,
        summary_count INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(chat_id, summary_date)
      )
    `;

    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON messages(chat_id, timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_chat_id ON messages(chat_id)',
      'CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_chat_settings_chat_id ON chat_settings(chat_id)',
      'CREATE INDEX IF NOT EXISTS idx_schedules_chat_id ON schedules(chat_id)',
      'CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run, is_active)',
      'CREATE INDEX IF NOT EXISTS idx_summary_logs_chat_date ON summary_logs(chat_id, summary_date)'
    ];

    return new Promise((resolve, reject) => {
      this.db.run(createMessagesTable, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.db.run(createChatSettingsTable, (err) => {
          if (err) {
            reject(err);
            return;
          }

          this.db.run(createSchedulesTable, (err) => {
            if (err) {
              reject(err);
              return;
            }

            this.db.run(createSummaryLogsTable, (err) => {
              if (err) {
                reject(err);
                return;
              }

              // Create indexes
              Promise.all(
                createIndexes.map(sql => new Promise((res, rej) => {
                  this.db.run(sql, (err) => err ? rej(err) : res());
                }))
              ).then(resolve).catch(reject);
            });
          });
        });
      });
    });
  }

  async saveMessage(messageData) {
    const sql = `
      INSERT INTO messages 
      (message_id, chat_id, user_id, username, first_name, last_name, text, timestamp, message_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      this.db.run(sql, [
        messageData.message_id,
        messageData.chat_id,
        messageData.user_id,
        messageData.username,
        messageData.first_name,
        messageData.last_name,
        messageData.text,
        messageData.timestamp,
        messageData.message_type
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  async getMessages(chatId, startTime, endTime, limit = 1000) {
    const sql = `
      SELECT * FROM messages 
      WHERE chat_id = ? AND timestamp BETWEEN ? AND ?
      ORDER BY timestamp ASC
      LIMIT ?
    `;

    return new Promise((resolve, reject) => {
      this.db.all(sql, [chatId, startTime, endTime, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getChatStats(chatId) {
    const sql = `
      SELECT 
        COUNT(*) as total_messages,
        COUNT(DISTINCT user_id) as unique_users,
        MIN(timestamp) as first_message,
        MAX(timestamp) as last_message
      FROM messages 
      WHERE chat_id = ?
    `;

    return new Promise((resolve, reject) => {
      this.db.get(sql, [chatId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async clearChatHistory(chatId) {
    const sql = 'DELETE FROM messages WHERE chat_id = ?';
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, [chatId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  async getChatSettings(chatId) {
    const sql = 'SELECT * FROM chat_settings WHERE chat_id = ?';
    
    return new Promise((resolve, reject) => {
      this.db.get(sql, [chatId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          // Return default settings if none exist
          resolve(row || { 
            chat_id: chatId, 
            language: 'en', 
            summary_length: 1500,
            timezone: 'UTC'
          });
        }
      });
    });
  }

  async setChatLanguage(chatId, language) {
    const sql = `
      INSERT OR REPLACE INTO chat_settings (
        id, chat_id, language, summary_length, timezone, created_at, updated_at
      ) VALUES (
        (SELECT id FROM chat_settings WHERE chat_id = ?),
        ?, ?, 
        COALESCE((SELECT summary_length FROM chat_settings WHERE chat_id = ?), 1500),
        COALESCE((SELECT timezone FROM chat_settings WHERE chat_id = ?), 'UTC'),
        COALESCE((SELECT created_at FROM chat_settings WHERE chat_id = ?), CURRENT_TIMESTAMP),
        CURRENT_TIMESTAMP
      )
    `;
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, [chatId, chatId, language, chatId, chatId, chatId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID || this.changes);
        }
      });
    });
  }

  async setSummaryLength(chatId, length) {
    const sql = `
      INSERT OR REPLACE INTO chat_settings (
        id, chat_id, language, summary_length, timezone, created_at, updated_at
      ) VALUES (
        (SELECT id FROM chat_settings WHERE chat_id = ?),
        ?, 
        COALESCE((SELECT language FROM chat_settings WHERE chat_id = ?), 'en'),
        ?, 
        COALESCE((SELECT timezone FROM chat_settings WHERE chat_id = ?), 'UTC'),
        COALESCE((SELECT created_at FROM chat_settings WHERE chat_id = ?), CURRENT_TIMESTAMP),
        CURRENT_TIMESTAMP
      )
    `;
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, [chatId, chatId, chatId, length, chatId, chatId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID || this.changes);
        }
      });
    });
  }

  async setChatTimezone(chatId, timezone) {
    const sql = `
      INSERT OR REPLACE INTO chat_settings (
        id, chat_id, language, summary_length, timezone, created_at, updated_at
      ) VALUES (
        (SELECT id FROM chat_settings WHERE chat_id = ?),
        ?, 
        COALESCE((SELECT language FROM chat_settings WHERE chat_id = ?), 'en'),
        COALESCE((SELECT summary_length FROM chat_settings WHERE chat_id = ?), 1500),
        ?, 
        COALESCE((SELECT created_at FROM chat_settings WHERE chat_id = ?), CURRENT_TIMESTAMP),
        CURRENT_TIMESTAMP
      )
    `;
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, [chatId, chatId, chatId, chatId, timezone, chatId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID || this.changes);
        }
      });
    });
  }

  async createSchedule(chatId, scheduleType, intervalHours) {
    // First, delete any existing schedules for this chat
    await this.deleteSchedule(chatId);
    
    // Get user's timezone settings
    const settings = await this.getChatSettings(chatId);
    const userTimezone = settings.timezone || 'UTC';
    
    const nextRun = this.calculateNextScheduleTime(scheduleType, intervalHours, userTimezone);
    
    const sql = `
      INSERT INTO schedules (chat_id, schedule_type, interval_hours, next_run, is_active)
      VALUES (?, ?, ?, ?, 1)
    `;
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, [chatId, scheduleType, intervalHours, nextRun], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  calculateNextScheduleTime(scheduleType, intervalHours, timezone = 'UTC') {
    const now = moment().tz(timezone);
    
    if (scheduleType === 'daily') {
      // For daily schedules, we want 9:00 AM in the user's timezone
      let next9AM = now.clone().hour(9).minute(0).second(0).millisecond(0);
      
      // If it's already past 9 AM today, schedule for 9 AM tomorrow
      if (now.hour() >= 9) {
        next9AM.add(1, 'day');
      }
      
      return Math.floor(next9AM.unix());
    } else if (scheduleType === 'weekly') {
      // For weekly schedules, we want Sunday at 9:00 AM in the user's timezone
      let nextSunday = now.clone().day(0).hour(9).minute(0).second(0).millisecond(0); // Sunday = 0
      
      // If it's already past Sunday 9 AM this week, schedule for next Sunday
      if (now.day() > 0 || (now.day() === 0 && now.hour() >= 9)) {
        nextSunday.add(1, 'week');
      }
      
      return Math.floor(nextSunday.unix());
    } else {
      // For custom schedules (like 3days), just add the interval from now
      const futureTime = now.clone().add(intervalHours, 'hours');
      return Math.floor(futureTime.unix());
    }
  }

  async getActiveSchedules(chatId = null) {
    let sql = 'SELECT * FROM schedules WHERE is_active = 1';
    let params = [];
    
    if (chatId) {
      sql += ' AND chat_id = ?';
      params.push(chatId);
    }
    
    sql += ' ORDER BY next_run ASC';
    
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getPendingSchedules() {
    const now = Math.floor(Date.now() / 1000);
    const sql = 'SELECT * FROM schedules WHERE is_active = 1 AND next_run <= ? ORDER BY next_run ASC';
    
    return new Promise((resolve, reject) => {
      this.db.all(sql, [now], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async updateScheduleNextRun(scheduleId, nextRun) {
    const sql = 'UPDATE schedules SET next_run = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, [nextRun, scheduleId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  async deleteSchedule(chatId, scheduleType = null) {
    let sql = 'DELETE FROM schedules WHERE chat_id = ?';
    let params = [chatId];
    
    if (scheduleType) {
      sql += ' AND schedule_type = ?';
      params.push(scheduleType);
    }
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  async deactivateSchedule(scheduleId) {
    const sql = 'UPDATE schedules SET is_active = 0 WHERE id = ?';
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, [scheduleId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  async incrementSummaryCount(chatId) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const sql = `
      INSERT INTO summary_logs (chat_id, summary_date, summary_count, created_at, updated_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(chat_id, summary_date) 
      DO UPDATE SET 
        summary_count = summary_count + 1,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, [chatId, today], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  async getDailySummaryCount(chatId) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const sql = 'SELECT summary_count FROM summary_logs WHERE chat_id = ? AND summary_date = ?';
    
    return new Promise((resolve, reject) => {
      this.db.get(sql, [chatId, today], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? row.summary_count : 0);
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = Database;
