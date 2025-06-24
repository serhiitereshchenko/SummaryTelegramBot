const moment = require('moment-timezone');
const logger = require('./logger');

class CommandHandler {
  constructor(database, summaryService) {
    this.db = database;
    this.summaryService = summaryService;
  }

  async handleStart(bot, msg) {
    const welcomeMessage = `
🤖 *Welcome to Telegram Summary Bot!*

I can create AI\\-powered summaries of your chat conversations using OpenAI \\(ChatGPT\\).

*How it works:*
• I automatically collect and store text messages
• Use \`/summary\` to generate intelligent summaries
• Summaries include key topics, important moments, and insights

*Quick Start:*
• \`/summary\` \\- Generate summary of last 24 hours
• \`/help\` \\- See all available commands
• \`/language [code]\` \\- Set your preferred language

*Privacy:* I only store text messages, no media or personal data.

Try \`/summary\` to get started! 🚀
    `.trim();

    bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'Markdown' });
  }

  async handleHelp(bot, msg) {
    const response = `
🤖 *Telegram Summary Bot*

*Available Commands:*

📝 *Summary Generation*
• \`/summary\` \\- Generate summary of last 24 hours
• \`/summary 6h\` \\- Summary of last 6 hours
• \`/summary today\` \\- Summary of today only
• \`/summary yesterday\` \\- Summary of yesterday
• \`/summary 3d\` \\- Summary of last 3 days

⚙️ *Configuration* \\(Admin only\\)
• \`/language [code]\` \\- Set summary language
• \`/length [number]\` \\- Set summary detail level
• \`/timezone [code]\` \\- Set timezone for date formatting
• \`/schedule [option]\` \\- Set automatic summaries

📊 *Information*
• \`/stats\` \\- Show chat statistics
• \`/clear\` \\- Clear chat history \\(Admin only\\)

*Examples:*
• \`/summary 12h\` \\- Last 12 hours
• \`/language es\` \\- Spanish summaries
• \`/length 2000\` \\- Detailed summaries
• \`/schedule daily\` \\- Daily auto\\-summaries

*Supported Languages:* en, es, fr, de, it, pt, ru, ja, ko, zh, ar, hi, uk, pl, nl, tr
    `.trim();

    bot.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
  }

  async handleSummary(bot, msg, period) {
    const chatId = msg.chat.id;
    
    // Show typing indicator
    bot.sendChatAction(chatId, 'typing');

    try {
      // Check daily summary limit (10 per day)
      const dailyCount = await this.db.getDailySummaryCount(chatId);
      const DAILY_LIMIT = 10;
      
      if (dailyCount >= DAILY_LIMIT) {
        const response = `🚫 Daily summary limit reached! 

You've used ${dailyCount}/${DAILY_LIMIT} summaries today.

⏰ Daily limit resets at midnight (UTC).
📅 Try again tomorrow or upgrade for unlimited summaries.

💡 Tip: Use longer time periods (like /summary 7d) to get more comprehensive summaries.`;
        
        bot.sendMessage(chatId, response);
        return;
      }

      // Increment summary count for today
      await this.db.incrementSummaryCount(chatId);

      const timeRange = this.parseTimePeriod(period || '24h');
      const messages = await this.db.getMessages(
        chatId, 
        timeRange.start, 
        timeRange.end
      );

      if (messages.length === 0) {
        bot.sendMessage(chatId, '📭 No messages found for the specified time period.');
        return;
      }

      // Get chat settings for language preference
      const settings = await this.db.getChatSettings(chatId);
      
      // Generate summary using OpenAI service
      const summary = await this.summaryService.generateSummary(messages, {
        language: settings.language,
        maxLength: settings.summary_length
      });
      
      const translations = this.getTranslations(settings.language);
      const dateFormat = this.getLocalizedDate(timeRange.start, timeRange.end, settings.language, settings.timezone);
      
      // Temporarily disable clickable timecodes to fix Markdown parsing error
      // const processedSummary = this.summaryService.postProcessSummary(summary, messages, chatId);
      const processedSummary = summary;
      
      const response = `
📝 ${translations.chatSummary} (${this.translateTimePeriod(timeRange.description, settings.language)})
📅 ${dateFormat}
💬 ${messages.length} ${translations.messagesAnalyzed}

${processedSummary}
      `.trim();

      // Send as plain text without any formatting
      bot.sendMessage(chatId, response);
      
    } catch (error) {
      logger.error('Error in handleSummary:', error);
      bot.sendMessage(chatId, '❌ Error generating summary. Please try again later.');
    }
  }

  async handleStats(bot, msg) {
    const chatId = msg.chat.id;

    try {
      const stats = await this.db.getChatStats(chatId);
      
      if (stats.total_messages === 0) {
        bot.sendMessage(chatId, '📊 No messages stored yet. Start chatting to see statistics!');
        return;
      }

      const firstMessage = moment.unix(stats.first_message).format('MMM DD, YYYY HH:mm');
      const lastMessage = moment.unix(stats.last_message).format('MMM DD, YYYY HH:mm');
      
      const response = `
📊 *Chat Statistics*

💬 Total messages: ${stats.total_messages}
👥 Unique users: ${stats.unique_users}
📅 First message: ${firstMessage}
🕐 Last message: ${lastMessage}
📈 Collection period: ${moment.unix(stats.first_message).fromNow()}
      `.trim();

      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      
    } catch (error) {
      logger.error('Error in handleStats:', error);
      bot.sendMessage(chatId, '❌ Error retrieving statistics.');
    }
  }

  async handleClear(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Check if user is admin or bot owner
    const isAdminUser = await this.isAdmin(bot, chatId, userId);
    const isOwner = await this.isBotOwner(userId);
    
    if (!isAdminUser && !isOwner) {
      bot.sendMessage(chatId, '🚫 Only chat administrators can clear chat history. Please ask an admin to clear the messages.');
      return;
    }

    try {
      const deletedCount = await this.db.clearChatHistory(chatId);
      bot.sendMessage(chatId, `🗑️ Cleared ${deletedCount} messages from chat history.`);
    } catch (error) {
      logger.error('Error in handleClear:', error);
      bot.sendMessage(chatId, '❌ Error clearing chat history.');
    }
  }

  async handleLanguage(bot, msg, languageCode) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Check if user is admin or bot owner
    const isAdminUser = await this.isAdmin(bot, chatId, userId);
    const isOwner = await this.isBotOwner(userId);
    
    if (!isAdminUser && !isOwner) {
      bot.sendMessage(chatId, '🚫 Only chat administrators can change bot settings. Please ask an admin to configure the language.');
      return;
    }

    const supportedLanguages = {
      'en': '🇺🇸 English',
      'es': '🇪🇸 Spanish',
      'fr': '🇫🇷 French', 
      'de': '🇩🇪 German',
      'it': '🇮🇹 Italian',
      'pt': '🇵🇹 Portuguese',
      'ru': '🇷🇺 Russian',
      'ja': '🇯🇵 Japanese',
      'ko': '🇰🇷 Korean',
      'zh': '🇨🇳 Chinese',
      'ar': '🇸🇦 Arabic',
      'hi': '🇮🇳 Hindi',
      'uk': '🇺🇦 Ukrainian',
      'pl': '🇵🇱 Polish',
      'nl': '🇳🇱 Dutch',
      'tr': '🇹🇷 Turkish'
    };

    try {
      if (!languageCode) {
        // Show current language and available options
        const settings = await this.db.getChatSettings(chatId);
        const currentLang = supportedLanguages[settings.language] || '🇺🇸 English';
        
        const languageList = Object.entries(supportedLanguages)
          .map(([code, name]) => `• /language ${code} - ${name}`)
          .join('\n');
        
        const response = `
🌍 *Current Language:* ${currentLang}

*Available languages:*
${languageList}

*Usage:* \`/language [code]\`
*Example:* \`/language es\`
        `.trim();
        
        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return;
      }

      if (!supportedLanguages[languageCode]) {
        bot.sendMessage(chatId, `❌ Language "${languageCode}" is not supported. Use /language to see available languages.`);
        return;
      }

      await this.db.setChatLanguage(chatId, languageCode);
      const languageName = supportedLanguages[languageCode];
      bot.sendMessage(chatId, `✅ Language set to ${languageName}. Future summaries will be in this language.`);
      
    } catch (error) {
      logger.error('Error in handleLanguage:', error);
      bot.sendMessage(chatId, '❌ Error setting language preference.');
    }
  }

  async handleLength(bot, msg, lengthValue) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Check if user is admin or bot owner
    const isAdminUser = await this.isAdmin(bot, chatId, userId);
    const isOwner = await this.isBotOwner(userId);
    
    if (!isAdminUser && !isOwner) {
      bot.sendMessage(chatId, '🚫 Only chat administrators can change bot settings. Please ask an admin to configure the summary length.');
      return;
    }

    try {
      if (!lengthValue) {
        // Show current length and available options
        const settings = await this.db.getChatSettings(chatId);
        
        const response = `
📏 *Current Summary Length:* ${settings.summary_length} characters

*Available options:*
• \`/length 800\` \\- Short summaries
• \`/length 1500\` \\- Medium summaries \\(default\\)
• \`/length 2500\` \\- Long summaries  
• \`/length 4000\` \\- Very detailed summaries

*Usage:* \`/length [number]\`
*Example:* \`/length 2000\`

*Note:* Longer summaries provide more detail but take more time to generate.
        `.trim();
        
        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return;
      }

      const length = parseInt(lengthValue);
      
      if (isNaN(length) || length < 200 || length > 5000) {
        bot.sendMessage(chatId, '❌ Please enter a number between 200 and 5000 characters.');
        return;
      }

      await this.db.setSummaryLength(chatId, length);
      bot.sendMessage(chatId, `✅ Summary length set to ${length} characters. Future summaries will be ${length < 1000 ? 'shorter and more concise' : length < 2000 ? 'detailed' : 'very comprehensive'}.`);
      
    } catch (error) {
      logger.error('Error in handleLength:', error);
      bot.sendMessage(chatId, '❌ Error setting summary length.');
    }
  }

  async handleTimezone(bot, msg, timezoneCode) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Check if user is admin or bot owner
    const isAdminUser = await this.isAdmin(bot, chatId, userId);
    const isOwner = await this.isBotOwner(userId);
    
    if (!isAdminUser && !isOwner) {
      bot.sendMessage(chatId, '🚫 Only chat administrators can change bot settings. Please ask an admin to configure the timezone.');
      return;
    }

    const supportedTimezones = {
      'UTC': '🌍 UTC (Coordinated Universal Time)',
      'Europe/Kyiv': '🇺🇦 Kyiv (EET/EEST)',
      'America/New_York': '🇺🇸 Eastern Time (ET)',
      'America/Chicago': '🇺🇸 Central Time (CT)',
      'America/Denver': '🇺🇸 Mountain Time (MT)',
      'America/Los_Angeles': '🇺🇸 Pacific Time (PT)',
      'Europe/London': '🇬🇧 London (GMT/BST)',
      'Europe/Paris': '🇫🇷 Paris (CET/CEST)',
      'Europe/Berlin': '🇩🇪 Berlin (CET/CEST)',
      'Europe/Moscow': '🇷🇺 Moscow (MSK)',
      'Asia/Tokyo': '🇯🇵 Tokyo (JST)',
      'Asia/Shanghai': '🇨🇳 Shanghai (CST)',
      'Asia/Seoul': '🇰🇷 Seoul (KST)',
      'Asia/Dubai': '🇦🇪 Dubai (GST)',
      'Asia/Kolkata': '🇮🇳 Mumbai (IST)',
      'Australia/Sydney': '🇦🇺 Sydney (AEDT/AEST)',
      'Pacific/Auckland': '🇳🇿 Auckland (NZDT/NZST)'
    };

    try {
      if (!timezoneCode) {
        // Show current timezone and available options
        const settings = await this.db.getChatSettings(chatId);
        const currentTz = supportedTimezones[settings.timezone] || '🌍 UTC (Coordinated Universal Time)';
        
        const timezoneList = Object.entries(supportedTimezones)
          .map(([code, name]) => `• \`/timezone ${code}\` \\- ${name}`)
          .join('\n');
        
        const response = `
🕐 *Current Timezone:* ${currentTz}

*Available timezones:*
${timezoneList}

*Usage:* \`/timezone [code]\`
*Example:* \`/timezone Europe/London\`

*Note:* This affects how dates and times are displayed in summaries.
        `.trim();
        
        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return;
      }

      if (!supportedTimezones[timezoneCode]) {
        bot.sendMessage(chatId, `❌ Timezone "${timezoneCode}" is not supported. Use /timezone to see available timezones.`);
        return;
      }

      await this.db.setChatTimezone(chatId, timezoneCode);
      const timezoneName = supportedTimezones[timezoneCode];
      bot.sendMessage(chatId, `✅ Timezone set to ${timezoneName}. Future summaries will use this timezone for date formatting.`);
      
    } catch (error) {
      logger.error('Error in handleTimezone:', error);
      bot.sendMessage(chatId, '❌ Error setting timezone preference.');
    }
  }

  async handleSchedule(bot, msg, action) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Check if user is admin or bot owner
    const isAdminUser = await this.isAdmin(bot, chatId, userId);
    const isOwner = await this.isBotOwner(userId);
    
    if (!isAdminUser && !isOwner) {
      bot.sendMessage(chatId, '🚫 Only chat administrators can change bot settings. Please ask an admin to configure scheduled summaries.');
      return;
    }

    try {
      if (!action) {
        // Show current schedule and available options
        const schedules = await this.db.getActiveSchedules(chatId);
        
        let currentSchedule = 'None';
        if (schedules.length > 0) {
          const schedule = schedules[0];
          if (schedule.schedule_type === 'daily') {
            currentSchedule = 'Daily summaries';
          } else if (schedule.schedule_type === 'weekly') {
            currentSchedule = 'Weekly summaries';
          } else {
            currentSchedule = `Every ${schedule.interval_hours} hours`;
          }
        }
        
        const response = `
⏰ *Current Schedule:* ${currentSchedule}

*Available options:*
• \`/schedule daily\` \\- Daily summaries at 9 AM
• \`/schedule 3days\` \\- Every 3 days
• \`/schedule weekly\` \\- Weekly summaries on Sunday
• \`/schedule off\` \\- Cancel scheduled summaries

*Usage:* \`/schedule [option]\`
*Example:* \`/schedule daily\`

*Note:* Scheduled summaries are sent automatically to this chat.
        `.trim();
        
        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return;
      }

      if (action === 'off') {
        await this.db.deleteSchedule(chatId);
        bot.sendMessage(chatId, '✅ Scheduled summaries have been cancelled.');
        return;
      }

      let scheduleType, intervalHours;
      
      switch (action) {
        case 'daily':
          scheduleType = 'daily';
          intervalHours = 24;
          break;
        case 'weekly':
          scheduleType = 'weekly';
          intervalHours = 168; // 7 days
          break;
        case '3days':
          scheduleType = 'custom';
          intervalHours = 72; // 3 days
          break;
        default:
          bot.sendMessage(chatId, '❌ Invalid schedule option. Use /schedule to see available options.');
          return;
      }

      await this.db.createSchedule(chatId, scheduleType, intervalHours);
      
      let scheduleText;
      switch (action) {
        case 'daily':
          scheduleText = 'daily summaries at 9 AM';
          break;
        case 'weekly':
          scheduleText = 'weekly summaries on Sunday';
          break;
        case '3days':
          scheduleText = 'summaries every 3 days';
          break;
      }
      
      bot.sendMessage(chatId, `✅ Scheduled ${scheduleText}. Summaries will be sent automatically to this chat.`);
      
    } catch (error) {
      logger.error('Error in handleSchedule:', error);
      bot.sendMessage(chatId, '❌ Error setting schedule.');
    }
  }

  parseTimePeriod(period) {
    const now = moment();
    let start, end, description;

    if (!period) period = '24h';
    period = period.toLowerCase();

    switch (period) {
      case 'today':
        start = moment().startOf('day');
        end = now;
        description = 'Today';
        break;
      case 'yesterday':
        start = moment().subtract(1, 'day').startOf('day');
        end = moment().subtract(1, 'day').endOf('day');
        description = 'Yesterday';
        break;
      default:
        // Parse duration like "24h", "3d", "1w"
        const match = period.match(/^(\d+)([hdw])$/);
        if (match) {
          const amount = parseInt(match[1]);
          const unit = match[2];
          const unitMap = { h: 'hours', d: 'days', w: 'weeks' };
          
          start = moment().subtract(amount, unitMap[unit]);
          end = now;
          description = `Last ${amount}${unit}`;
        } else {
          // Default to 24h
          start = moment().subtract(24, 'hours');
          end = now;
          description = 'Last 24h';
        }
    }

    return {
      start: start.unix(),
      end: end.unix(),
      description
    };
  }

  getTranslations(language) {
    const translations = {
      'en': {
        chatSummary: 'Chat Summary',
        messagesAnalyzed: 'messages',
        summariesRemaining: 'summaries remaining today'
      },
      'es': {
        chatSummary: 'Resumen del Chat',
        messagesAnalyzed: 'mensajes',
        summariesRemaining: 'resúmenes restantes hoy'
      },
      'fr': {
        chatSummary: 'Résumé du Chat',
        messagesAnalyzed: 'messages',
        summariesRemaining: 'résumés restants aujourd\'hui'
      },
      'de': {
        chatSummary: 'Chat-Zusammenfassung',
        messagesAnalyzed: 'Nachrichten',
        summariesRemaining: 'Zusammenfassungen heute übrig'
      },
      'it': {
        chatSummary: 'Riassunto Chat',
        messagesAnalyzed: 'messaggi',
        summariesRemaining: 'riassunti rimanenti oggi'
      },
      'pt': {
        chatSummary: 'Resumo do Chat',
        messagesAnalyzed: 'mensagens',
        summariesRemaining: 'resumos restantes hoje'
      },
      'ru': {
        chatSummary: 'Сводка Чата',
        messagesAnalyzed: 'сообщений',
        summariesRemaining: 'сводок осталось сегодня'
      },
      'ja': {
        chatSummary: 'チャットサマリー',
        messagesAnalyzed: 'メッセージ',
        summariesRemaining: '今日残りのサマリー'
      },
      'ko': {
        chatSummary: '채팅 요약',
        messagesAnalyzed: '메시지',
        summariesRemaining: '오늘 남은 요약'
      },
      'zh': {
        chatSummary: '聊天摘要',
        messagesAnalyzed: '条消息',
        summariesRemaining: '今日剩余摘要'
      },
      'ar': {
        chatSummary: 'ملخص الدردشة',
        messagesAnalyzed: 'رسالة',
        summariesRemaining: 'ملخصات متبقية اليوم'
      },
      'hi': {
        chatSummary: 'चैट सारांश',
        messagesAnalyzed: 'संदेश',
        summariesRemaining: 'आज शेष सारांश'
      },
      'uk': {
        chatSummary: 'Підсумок Чату',
        messagesAnalyzed: 'повідомлень',
        summariesRemaining: 'підсумків залишилося сьогодні'
      },
      'pl': {
        chatSummary: 'Podsumowanie Czatu',
        messagesAnalyzed: 'wiadomości',
        summariesRemaining: 'podsumowań pozostało dziś'
      },
      'nl': {
        chatSummary: 'Chat Samenvatting',
        messagesAnalyzed: 'berichten',
        summariesRemaining: 'samenvattingen over vandaag'
      },
      'tr': {
        chatSummary: 'Sohbet Özeti',
        messagesAnalyzed: 'mesaj',
        summariesRemaining: 'bugün kalan özet'
      }
    };

    return translations[language] || translations['en'];
  }

  translateTimePeriod(description, language) {
    const periodTranslations = {
      'en': {
        'Today': 'Today',
        'Yesterday': 'Yesterday',
        'Last 24h': 'Last 24h',
        'Last 12h': 'Last 12h',
        'Last 6h': 'Last 6h',
        'Last 3h': 'Last 3h',
        'Last 3d': 'Last 3d',
        'Last 1w': 'Last 1w',
        'Last 2w': 'Last 2w'
      },
      'es': {
        'Today': 'Hoy',
        'Yesterday': 'Ayer',
        'Last 24h': 'Últimas 24h',
        'Last 12h': 'Últimas 12h',
        'Last 6h': 'Últimas 6h',
        'Last 3h': 'Últimas 3h',
        'Last 3d': 'Últimos 3d',
        'Last 1w': 'Última 1s',
        'Last 2w': 'Últimas 2s'
      },
      'fr': {
        'Today': 'Aujourd\'hui',
        'Yesterday': 'Hier',
        'Last 24h': 'Dernières 24h',
        'Last 12h': 'Dernières 12h',
        'Last 6h': 'Dernières 6h',
        'Last 3h': 'Dernières 3h',
        'Last 3d': 'Derniers 3j',
        'Last 1w': 'Dernière 1s',
        'Last 2w': 'Dernières 2s'
      },
      'de': {
        'Today': 'Heute',
        'Yesterday': 'Gestern',
        'Last 24h': 'Letzten 24h',
        'Last 12h': 'Letzten 12h',
        'Last 6h': 'Letzten 6h',
        'Last 3h': 'Letzten 3h',
        'Last 3d': 'Letzten 3T',
        'Last 1w': 'Letzte 1W',
        'Last 2w': 'Letzten 2W'
      },
      'it': {
        'Today': 'Oggi',
        'Yesterday': 'Ieri',
        'Last 24h': 'Ultime 24h',
        'Last 12h': 'Ultime 12h',
        'Last 6h': 'Ultime 6h',
        'Last 3h': 'Ultime 3h',
        'Last 3d': 'Ultimi 3g',
        'Last 1w': 'Ultima 1s',
        'Last 2w': 'Ultime 2s'
      },
      'pt': {
        'Today': 'Hoje',
        'Yesterday': 'Ontem',
        'Last 24h': 'Últimas 24h',
        'Last 12h': 'Últimas 12h',
        'Last 6h': 'Últimas 6h',
        'Last 3h': 'Últimas 3h',
        'Last 3d': 'Últimos 3d',
        'Last 1w': 'Última 1s',
        'Last 2w': 'Últimas 2s'
      },
      'ru': {
        'Today': 'Сегодня',
        'Yesterday': 'Вчера',
        'Last 24h': 'Последние 24ч',
        'Last 12h': 'Последние 12ч',
        'Last 6h': 'Последние 6ч',
        'Last 3h': 'Последние 3ч',
        'Last 3d': 'Последние 3д',
        'Last 1w': 'Последняя 1н',
        'Last 2w': 'Последние 2н'
      },
      'uk': {
        'Today': 'Сьогодні',
        'Yesterday': 'Вчора',
        'Last 24h': 'Останні 24г',
        'Last 12h': 'Останні 12г',
        'Last 6h': 'Останні 6г',
        'Last 3h': 'Останні 3г',
        'Last 3d': 'Останні 3д',
        'Last 1w': 'Останній 1т',
        'Last 2w': 'Останні 2т'
      },
      'pl': {
        'Today': 'Dzisiaj',
        'Yesterday': 'Wczoraj',
        'Last 24h': 'Ostatnie 24h',
        'Last 12h': 'Ostatnie 12h',
        'Last 6h': 'Ostatnie 6h',
        'Last 3h': 'Ostatnie 3h',
        'Last 3d': 'Ostatnie 3d',
        'Last 1w': 'Ostatni 1t',
        'Last 2w': 'Ostatnie 2t'
      },
      'nl': {
        'Today': 'Vandaag',
        'Yesterday': 'Gisteren',
        'Last 24h': 'Laatste 24u',
        'Last 12h': 'Laatste 12u',
        'Last 6h': 'Laatste 6u',
        'Last 3h': 'Laatste 3u',
        'Last 3d': 'Laatste 3d',
        'Last 1w': 'Laatste 1w',
        'Last 2w': 'Laatste 2w'
      },
      'tr': {
        'Today': 'Bugün',
        'Yesterday': 'Dün',
        'Last 24h': 'Son 24s',
        'Last 12h': 'Son 12s',
        'Last 6h': 'Son 6s',
        'Last 3h': 'Son 3s',
        'Last 3d': 'Son 3g',
        'Last 1w': 'Son 1h',
        'Last 2w': 'Son 2h'
      },
      'ja': {
        'Today': '今日',
        'Yesterday': '昨日',
        'Last 24h': '過去24時間',
        'Last 12h': '過去12時間',
        'Last 6h': '過去6時間',
        'Last 3h': '過去3時間',
        'Last 3d': '過去3日',
        'Last 1w': '過去1週',
        'Last 2w': '過去2週'
      },
      'ko': {
        'Today': '오늘',
        'Yesterday': '어제',
        'Last 24h': '지난 24시간',
        'Last 12h': '지난 12시간',
        'Last 6h': '지난 6시간',
        'Last 3h': '지난 3시간',
        'Last 3d': '지난 3일',
        'Last 1w': '지난 1주',
        'Last 2w': '지난 2주'
      },
      'zh': {
        'Today': '今天',
        'Yesterday': '昨天',
        'Last 24h': '过去24小时',
        'Last 12h': '过去12小时',
        'Last 6h': '过去6小时',
        'Last 3h': '过去3小时',
        'Last 3d': '过去3天',
        'Last 1w': '过去1周',
        'Last 2w': '过去2周'
      },
      'ar': {
        'Today': 'اليوم',
        'Yesterday': 'أمس',
        'Last 24h': 'آخر 24 ساعة',
        'Last 12h': 'آخر 12 ساعة',
        'Last 6h': 'آخر 6 ساعات',
        'Last 3h': 'آخر 3 ساعات',
        'Last 3d': 'آخر 3 أيام',
        'Last 1w': 'آخر أسبوع',
        'Last 2w': 'آخر أسبوعين'
      },
      'hi': {
        'Today': 'आज',
        'Yesterday': 'कल',
        'Last 24h': 'पिछले 24 घंटे',
        'Last 12h': 'पिछले 12 घंटे',
        'Last 6h': 'पिछले 6 घंटे',
        'Last 3h': 'पिछले 3 घंटे',
        'Last 3d': 'पिछले 3 दिन',
        'Last 1w': 'पिछला 1 सप्ताह',
        'Last 2w': 'पिछले 2 सप्ताह'
      }
    };

    const languageTranslations = periodTranslations[language] || periodTranslations['en'];
    return languageTranslations[description] || description;
  }

  getLocalizedDate(startTimestamp, endTimestamp, language, timezone = 'UTC') {
    const start = moment.unix(startTimestamp).tz(timezone);
    const end = moment.unix(endTimestamp).tz(timezone);
    
    // Language-specific date formatting
    const dateFormats = {
      'en': () => `${start.format('MMM DD, YYYY HH:mm')} - ${end.format('MMM DD, YYYY HH:mm')}`,
      'es': () => `${start.format('DD MMM YYYY HH:mm')} - ${end.format('DD MMM YYYY HH:mm')}`,
      'fr': () => `${start.format('DD MMM YYYY HH:mm')} - ${end.format('DD MMM YYYY HH:mm')}`,
      'de': () => `${start.format('DD. MMM YYYY HH:mm')} - ${end.format('DD. MMM YYYY HH:mm')}`,
      'it': () => `${start.format('DD MMM YYYY HH:mm')} - ${end.format('DD MMM YYYY HH:mm')}`,
      'pt': () => `${start.format('DD MMM YYYY HH:mm')} - ${end.format('DD MMM YYYY HH:mm')}`,
      'ru': () => `${this.formatRussianDate(start)} - ${this.formatRussianDate(end)}`,
      'uk': () => `${this.formatUkrainianDate(start)} - ${this.formatUkrainianDate(end)}`,
      'pl': () => `${this.formatPolishDate(start)} - ${this.formatPolishDate(end)}`,
      'nl': () => `${start.format('DD MMM YYYY HH:mm')} - ${end.format('DD MMM YYYY HH:mm')}`,
      'tr': () => `${this.formatTurkishDate(start)} - ${this.formatTurkishDate(end)}`,
      'ja': () => `${this.formatJapaneseDate(start)} - ${this.formatJapaneseDate(end)}`,
      'ko': () => `${this.formatKoreanDate(start)} - ${this.formatKoreanDate(end)}`,
      'zh': () => `${this.formatChineseDate(start)} - ${this.formatChineseDate(end)}`,
      'ar': () => `${this.formatArabicDate(start)} - ${this.formatArabicDate(end)}`,
      'hi': () => `${this.formatHindiDate(start)} - ${this.formatHindiDate(end)}`
    };

    const formatter = dateFormats[language] || dateFormats['en'];
    return formatter();
  }

  formatUkrainianDate(momentObj) {
    const months = ['січ', 'лют', 'бер', 'квіт', 'трав', 'черв', 'лип', 'серп', 'вер', 'жовт', 'лист', 'груд'];
    const day = momentObj.date();
    const month = months[momentObj.month()];
    const year = momentObj.year();
    const time = momentObj.format('HH:mm');
    return `${day} ${month} ${year} ${time}`;
  }

  formatRussianDate(momentObj) {
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const day = momentObj.date();
    const month = months[momentObj.month()];
    const year = momentObj.year();
    const time = momentObj.format('HH:mm');
    return `${day} ${month} ${year} ${time}`;
  }

  formatPolishDate(momentObj) {
    const months = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
    const day = momentObj.date();
    const month = months[momentObj.month()];
    const year = momentObj.year();
    const time = momentObj.format('HH:mm');
    return `${day} ${month} ${year} ${time}`;
  }

  formatTurkishDate(momentObj) {
    const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    const day = momentObj.date();
    const month = months[momentObj.month()];
    const year = momentObj.year();
    const time = momentObj.format('HH:mm');
    return `${day} ${month} ${year} ${time}`;
  }

  formatJapaneseDate(momentObj) {
    const day = momentObj.date();
    const month = momentObj.month() + 1;
    const year = momentObj.year();
    const time = momentObj.format('HH:mm');
    return `${year}年${month}月${day}日 ${time}`;
  }

  formatKoreanDate(momentObj) {
    const day = momentObj.date();
    const month = momentObj.month() + 1;
    const year = momentObj.year();
    const time = momentObj.format('HH:mm');
    return `${year}년 ${month}월 ${day}일 ${time}`;
  }

  formatChineseDate(momentObj) {
    const day = momentObj.date();
    const month = momentObj.month() + 1;
    const year = momentObj.year();
    const time = momentObj.format('HH:mm');
    return `${year}年${month}月${day}日 ${time}`;
  }

  formatArabicDate(momentObj) {
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const day = momentObj.date();
    const month = months[momentObj.month()];
    const year = momentObj.year();
    const time = momentObj.format('HH:mm');
    return `${day} ${month} ${year} ${time}`;
  }

  formatHindiDate(momentObj) {
    const months = ['जन', 'फर', 'मार', 'अप्र', 'मई', 'जून', 'जुल', 'अग', 'सित', 'अक्ट', 'नव', 'दिस'];
    const day = momentObj.date();
    const month = months[momentObj.month()];
    const year = momentObj.year();
    const time = momentObj.format('HH:mm');
    return `${day} ${month} ${year} ${time}`;
  }

  async isAdmin(bot, chatId, userId) {
    try {
      // Get chat member info
      const chatMember = await bot.getChatMember(chatId, userId);
      
      // Check if user is admin, creator, or bot owner
      return chatMember.status === 'creator' || 
             chatMember.status === 'administrator' ||
             chatMember.can_manage_chat === true;
    } catch (error) {
      logger.error('Error checking admin status:', error);
      return false;
    }
  }

  async isBotOwner(userId) {
    // Check if the user is the bot owner (you can set this in environment variables)
    const botOwnerId = process.env.BOT_OWNER_ID;
    if (!botOwnerId) return false;
    
    // Parse BOT_OWNER_ID as comma-separated list of IDs
    const ownerIds = botOwnerId.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    return ownerIds.includes(userId);
  }
}

module.exports = CommandHandler;
