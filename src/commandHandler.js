const moment = require('moment-timezone');
const logger = require('./logger');

class CommandHandler {
  constructor(database, summaryService) {
    this.db = database;
    this.summaryService = summaryService;
  }

  async handleStart(bot, msg) {
    const settings = await this.db.getChatSettings(msg.chat.id);
    const t = this.getTranslations(settings.language);
    const welcomeMessage = t.start.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1').trim();
    bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'MarkdownV2' });
  }

  async handleHelp(bot, msg) {
    const settings = await this.db.getChatSettings(msg.chat.id);
    const t = this.getTranslations(settings.language);
    const response = t.help.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1').trim();
    bot.sendMessage(msg.chat.id, response, { parse_mode: 'MarkdownV2' });
  }

  async handleSummary(bot, msg, period) {
    const chatId = msg.chat.id;
    
    // Show typing indicator
    bot.sendChatAction(chatId, 'typing');

    try {
      // Get chat settings for language preference
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      
      // Check daily summary limit (10 per day)
      const dailyCount = await this.db.getDailySummaryCount(chatId);
      const DAILY_LIMIT = 10;
      
      if (dailyCount >= DAILY_LIMIT) {
        const response = t.dailyLimitReached(dailyCount, DAILY_LIMIT);
        
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
        bot.sendMessage(chatId, t.noMessages);
        return;
      }
      
      // Generate summary using OpenAI service
      const summary = await this.summaryService.generateSummary(messages, {
        language: settings.language,
        maxLength: settings.summary_length,
        timezone: settings.timezone
      });
      
      // Handle empty summary case
      if (!summary) {
        bot.sendMessage(chatId, t.noMessages);
        return;
      }
      
      const dateFormat = this.getLocalizedDate(timeRange.start, timeRange.end, settings.language, settings.timezone);
      
      // Temporarily disable clickable timecodes to fix Markdown parsing error
      // const processedSummary = this.summaryService.postProcessSummary(summary, messages, chatId, settings.timezone);
      const processedSummary = summary;
      
      const response = `
📝 ${t.chatSummary} (${this.translateTimePeriod(timeRange.description, settings.language)})
📅 ${dateFormat}
💬 ${messages.length} ${t.messagesAnalyzed}

${processedSummary}
      `.trim();

      // Send as plain text without any formatting
      bot.sendMessage(chatId, response);
      
    } catch (error) {
      logger.error('Error in handleSummary:', error);
      bot.sendMessage(chatId, t.errorGeneratingSummary);
    }
  }

  async handleStats(bot, msg) {
    const chatId = msg.chat.id;

    try {
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      
      const stats = await this.db.getChatStats(chatId);
      
      if (stats.total_messages === 0) {
        bot.sendMessage(chatId, t.statsNone);
        return;
      }

      const firstMessage = moment.unix(stats.first_message).format('MMM DD, YYYY HH:mm');
      const lastMessage = moment.unix(stats.last_message).format('MMM DD, YYYY HH:mm');
      
      const response = t.stats(stats.total_messages, stats.unique_users, firstMessage, lastMessage, moment.unix(stats.first_message).fromNow());

      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      
    } catch (error) {
      logger.error('Error in handleStats:', error);
      bot.sendMessage(chatId, t.errorStats);
    }
  }

  async handleClear(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Check if user is admin or bot owner
    const isAdminUser = await this.isAdmin(bot, chatId, userId);
    const isOwner = await this.isBotOwner(userId);
    
    if (!isAdminUser && !isOwner) {
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      bot.sendMessage(chatId, t.onlyAdminsClear);
      return;
    }

    try {
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      
      const deletedCount = await this.db.clearChatHistory(chatId);
      bot.sendMessage(chatId, t.cleared(deletedCount));
    } catch (error) {
      logger.error('Error in handleClear:', error);
      bot.sendMessage(chatId, t.errorClear);
    }
  }

  async handleLanguage(bot, msg, languageCode) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Check if user is admin or bot owner
    const isAdminUser = await this.isAdmin(bot, chatId, userId);
    const isOwner = await this.isBotOwner(userId);
    
    if (!isAdminUser && !isOwner) {
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      bot.sendMessage(chatId, t.onlyAdmins);
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
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      
      if (!languageCode) {
        // Show current language and available options
        const currentLang = supportedLanguages[settings.language] || '🇺🇸 English';
        
        const languageList = Object.entries(supportedLanguages)
          .map(([code, name]) => `• /language ${code} - ${name}`)
          .join('\n');
        
        const response = `
${t.currentLanguage(currentLang)}

*${t.availableLanguages}*
${languageList}

*${t.usage}* \`/language [code]\`
*${t.example}* \`/language es\`
        `.trim();
        
        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return;
      }

      if (!supportedLanguages[languageCode]) {
        bot.sendMessage(chatId, t.notSupportedLanguage(languageCode));
        return;
      }

      await this.db.setChatLanguage(chatId, languageCode);
      const languageName = supportedLanguages[languageCode];
      bot.sendMessage(chatId, t.languageSet(languageName));
      
    } catch (error) {
      logger.error('Error in handleLanguage:', error);
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      bot.sendMessage(chatId, t.errorSetLanguage);
    }
  }

  async handleLength(bot, msg, lengthValue) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Check if user is admin or bot owner
    const isAdminUser = await this.isAdmin(bot, chatId, userId);
    const isOwner = await this.isBotOwner(userId);
    
    if (!isAdminUser && !isOwner) {
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      bot.sendMessage(chatId, t.onlyAdmins);
      return;
    }

    try {
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      
      if (!lengthValue) {
        // Show current length and available options
        const response = `
${t.currentLength(settings.summary_length)}

*${t.availableOptions}:*
• \`/length 800\` \\- Short summaries
• \`/length 1500\` \\- Medium summaries \\(default\\)
• \`/length 2500\` \\- Long summaries  
• \`/length 4000\` \\- Very detailed summaries

*${t.usage}:* \`/length [number]\`
*${t.example}:* \`/length 2000\`

*${t.note}:* Longer summaries provide more detail but take more time to generate.
        `.trim();
        
        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return;
      }

      const length = parseInt(lengthValue);
      
      if (isNaN(length) || length < 200 || length > 5000) {
        bot.sendMessage(chatId, t.pleaseEnterNumber);
        return;
      }

      await this.db.setSummaryLength(chatId, length);
      const description = length < 1000 ? t.shorterConcise : length < 2000 ? t.detailed : t.veryComprehensive;
      bot.sendMessage(chatId, t.lengthSet(length, description));
      
    } catch (error) {
      logger.error('Error in handleLength:', error);
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      bot.sendMessage(chatId, t.errorSetLength);
    }
  }

  async handleTimezone(bot, msg, timezoneCode) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Check if user is admin or bot owner
    const isAdminUser = await this.isAdmin(bot, chatId, userId);
    const isOwner = await this.isBotOwner(userId);
    
    if (!isAdminUser && !isOwner) {
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      bot.sendMessage(chatId, t.onlyAdmins);
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
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      
      if (!timezoneCode) {
        // Show current timezone and available options
        const currentTz = supportedTimezones[settings.timezone] || '🌍 UTC (Coordinated Universal Time)';
        
        const timezoneList = Object.entries(supportedTimezones)
          .map(([code, name]) => `• \`/timezone ${code}\` \\- ${name}`)
          .join('\n');
        
        const response = `
${t.currentTimezone(currentTz)}

*${t.availableTimezones}:*
${timezoneList}

*${t.usage}:* \`/timezone [code]\`
*${t.example}:* \`/timezone Europe/London\`

*${t.note}:* This affects how dates and times are displayed in summaries.
        `.trim();
        
        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return;
      }

      if (!supportedTimezones[timezoneCode]) {
        bot.sendMessage(chatId, t.notSupportedTimezone(timezoneCode));
        return;
      }

      await this.db.setChatTimezone(chatId, timezoneCode);
      const timezoneName = supportedTimezones[timezoneCode];
      bot.sendMessage(chatId, t.timezoneSet(timezoneName));
      
    } catch (error) {
      logger.error('Error in handleTimezone:', error);
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      bot.sendMessage(chatId, t.errorSetTimezone);
    }
  }

  async handleSchedule(bot, msg, action) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Check if user is admin or bot owner
    const isAdminUser = await this.isAdmin(bot, chatId, userId);
    const isOwner = await this.isBotOwner(userId);
    
    if (!isAdminUser && !isOwner) {
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      bot.sendMessage(chatId, t.onlyAdmins);
      return;
    }

    try {
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      
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
${t.currentSchedule(currentSchedule)}

*${t.availableOptions}:*
• \`/schedule daily\` \\- Daily summaries at 9 AM
• \`/schedule 3days\` \\- Every 3 days
• \`/schedule weekly\` \\- Weekly summaries on Sunday
• \`/schedule off\` \\- Cancel scheduled summaries

*${t.usage}:* \`/schedule [option]\`
*${t.example}:* \`/schedule daily\`

*${t.note}:* Scheduled summaries are sent automatically to this chat.
        `.trim();
        
        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        return;
      }

      if (action === 'off') {
        await this.db.deleteSchedule(chatId);
        bot.sendMessage(chatId, t.scheduleCancelled);
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
          bot.sendMessage(chatId, t.invalidSchedule);
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
      
      bot.sendMessage(chatId, t.scheduleSet(scheduleText));
      
    } catch (error) {
      logger.error('Error in handleSchedule:', error);
      const settings = await this.db.getChatSettings(chatId);
      const t = this.getTranslations(settings.language);
      bot.sendMessage(chatId, t.errorSetSchedule);
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
        summariesRemaining: 'summaries remaining today',
        help: `🤖 *Telegram Summary Bot*

*Available Commands:*

📝 *Summary Generation*
• "/summary" - Generate summary of last 24 hours
• "/summary 6h" - Summary of last 6 hours
• "/summary today" - Summary of today only
• "/summary yesterday" - Summary of yesterday
• "/summary 3d" - Summary of last 3 days

⚙️ *Configuration* (Admin only)
• "/language [code]" - Set summary language
• "/length [number]" - Set summary detail level
• "/timezone [code]" - Set timezone for date formatting
• "/schedule [option]" - Set automatic summaries

📊 *Information*
• "/stats" - Show chat statistics
• "/clear" - Clear chat history (Admin only)

*Examples:*
• "/summary 12h" - Last 12 hours
• "/language es" - Spanish summaries
• "/length 2000" - Detailed summaries
• "/schedule daily" - Daily auto-summaries

*Supported Languages:* en, es, fr, de, it, pt, ru, ja, ko, zh, ar, hi, uk, pl, nl, tr`,
        start: `🤖 *Welcome to Telegram Summary Bot!*

I can create AI-powered summaries of your chat conversations using OpenAI (ChatGPT).

*How it works:*
• I automatically collect and store text messages
• Use "/summary" to generate intelligent summaries
• Summaries include key topics, important moments, and insights

*Quick Start:*
• "/summary" - Generate summary of last 24 hours
• "/help" - See all available commands
• "/language [code]" - Set your preferred language

*Privacy:* I only store text messages, no media or personal data.

Try "/summary" to get started! 🚀`,
        noMessages: '📭 No messages found for the specified time period.',
        errorGeneratingSummary: '❌ Error generating summary. Please try again later.',
        dailyLimitReached: (count, limit) => `🚫 Daily summary limit reached!\n\nYou've used ${count}/${limit} summaries today.\n\n⏰ Daily limit resets at midnight (UTC).\n📅 Try again tomorrow or upgrade for unlimited summaries.\n\n💡 Tip: Use longer time periods (like /summary 7d) to get more comprehensive summaries.`,
        statsNone: '📊 No messages stored yet. Start chatting to see statistics!',
        stats: (total, users, first, last, period) => `📊 *Chat Statistics*\n\n💬 Total messages: ${total}\n👥 Unique users: ${users}\n📅 First message: ${first}\n🕐 Last message: ${last}\n📈 Collection period: ${period}`,
        errorStats: '❌ Error retrieving statistics.',
        onlyAdmins: '🚫 Only chat administrators can change bot settings. Please ask an admin to configure.',
        onlyAdminsClear: '🚫 Only chat administrators can clear chat history. Please ask an admin to clear the messages.',
        cleared: (count) => `🗑️ Cleared ${count} messages from chat history.`,
        errorClear: '❌ Error clearing chat history.',
        languageSet: (lang) => `✅ Language set to ${lang}. Future summaries will be in this language.`,
        errorSetLanguage: '❌ Error setting language preference.',
        lengthSet: (length, description) => `✅ Summary length set to ${length} characters. Future summaries will be ${description}.`,
        errorSetLength: '❌ Error setting summary length.',
        timezoneSet: (tz) => `✅ Timezone set to ${tz}. Future summaries will use this timezone for date formatting.`,
        errorSetTimezone: '❌ Error setting timezone preference.',
        scheduleSet: (text) => `✅ Scheduled ${text}. Summaries will be sent automatically to this chat.`,
        errorSetSchedule: '❌ Error setting schedule.',
        scheduleCancelled: '✅ Scheduled summaries have been cancelled.',
        invalidSchedule: '❌ Invalid schedule option. Use /schedule to see available options.',
        notSupportedLanguage: (code) => `❌ Language "${code}" is not supported. Use /language to see available languages.`,
        notSupportedTimezone: (code) => `❌ Timezone "${code}" is not supported. Use /timezone to see available timezones.`,
        pleaseEnterNumber: '❌ Please enter a number between 200 and 5000 characters.',
        currentLanguage: (lang) => `🌍 *Current Language:* ${lang}`,
        currentLength: (length) => `📏 *Current Summary Length:* ${length} characters`,
        currentTimezone: (tz) => `🕐 *Current Timezone:* ${tz}`,
        currentSchedule: (schedule) => `⏰ *Current Schedule:* ${schedule}`,
        availableLanguages: 'Available languages:',
        availableOptions: 'Available options:',
        availableTimezones: 'Available timezones:',
        usage: 'Usage:',
        example: 'Example:',
        note: 'Note:',
        shorterConcise: 'shorter and more concise',
        detailed: 'detailed',
        veryComprehensive: 'very comprehensive'
      },
      'es': {
        chatSummary: 'Resumen del Chat',
        messagesAnalyzed: 'mensajes',
        summariesRemaining: 'resúmenes restantes hoy',
        help: `🤖 *Bot de Resumen de Telegram*

*Comandos Disponibles:*

📝 *Generación de Resúmenes*
• "/summary" - Generar resumen de las últimas 24 horas
• "/summary 6h" - Resumen de las últimas 6 horas
• "/summary today" - Resumen solo de hoy
• "/summary yesterday" - Resumen de ayer
• "/summary 3d" - Resumen de los últimos 3 días

⚙️ *Configuración* (Solo administradores)
• "/language [código]" - Establecer idioma del resumen
• "/length [número]" - Establecer nivel de detalle
• "/timezone [código]" - Establecer zona horaria
• "/schedule [opción]" - Establecer resúmenes automáticos

📊 *Información*
• "/stats" - Mostrar estadísticas del chat
• "/clear" - Limpiar historial del chat (Solo administradores)

*Ejemplos:*
• "/summary 12h" - Últimas 12 horas
• "/language es" - Resúmenes en español
• "/length 2000" - Resúmenes detallados
• "/schedule daily" - Resúmenes diarios automáticos

*Idiomas Soportados:* en, es, fr, de, it, pt, ru, ja, ko, zh, ar, hi, uk, pl, nl, tr`,
        start: `🤖 *¡Bienvenido al Bot de Resumen de Telegram!*

Puedo crear resúmenes con IA de tus conversaciones de chat usando OpenAI (ChatGPT).

*Cómo funciona:*
• Recojo y almaceno automáticamente mensajes de texto
• Usa "/summary" para generar resúmenes inteligentes
• Los resúmenes incluyen temas clave, momentos importantes e insights

*Inicio Rápido:*
• "/summary" - Generar resumen de las últimas 24 horas
• "/help" - Ver todos los comandos disponibles
• "/language [código]" - Establecer tu idioma preferido

*Privacidad:* Solo almaceno mensajes de texto, sin medios ni datos personales.

¡Prueba "/summary" para comenzar! 🚀`,
        noMessages: '📭 No se encontraron mensajes para el período especificado.',
        errorGeneratingSummary: '❌ Error generando resumen. Por favor, inténtalo de nuevo más tarde.',
        dailyLimitReached: (count, limit) => `🚫 ¡Límite diario de resúmenes alcanzado!\n\nHas usado ${count}/${limit} resúmenes hoy.\n\n⏰ El límite diario se reinicia a medianoche (UTC).\n📅 Inténtalo de nuevo mañana o actualiza para resúmenes ilimitados.\n\n💡 Consejo: Usa períodos más largos (como /summary 7d) para obtener resúmenes más completos.`,
        statsNone: '📊 Aún no hay mensajes almacenados. ¡Comienza a chatear para ver estadísticas!',
        stats: (total, users, first, last, period) => `📊 *Estadísticas del Chat*\n\n💬 Total de mensajes: ${total}\n👥 Usuarios únicos: ${users}\n📅 Primer mensaje: ${first}\n🕐 Último mensaje: ${last}\n📈 Período de recolección: ${period}`,
        errorStats: '❌ Error obteniendo estadísticas.',
        onlyAdmins: '🚫 Solo los administradores del chat pueden cambiar la configuración del bot. Pídele a un administrador que configure.',
        onlyAdminsClear: '🚫 Solo los administradores del chat pueden limpiar el historial. Pídele a un administrador que limpie los mensajes.',
        cleared: (count) => `🗑️ Se limpiaron ${count} mensajes del historial del chat.`,
        errorClear: '❌ Error limpiando historial del chat.',
        languageSet: (lang) => `✅ Idioma establecido en ${lang}. Los futuros resúmenes serán en este idioma.`,
        errorSetLanguage: '❌ Error estableciendo preferencia de idioma.',
        lengthSet: (length, description) => `✅ Longitud del resumen establecida en ${length} caracteres. Los futuros resúmenes serán ${description}.`,
        errorSetLength: '❌ Error estableciendo longitud del resumen.',
        timezoneSet: (tz) => `✅ Zona horaria establecida en ${tz}. Los futuros resúmenes usarán esta zona horaria para el formato de fecha.`,
        errorSetTimezone: '❌ Error estableciendo preferencia de zona horaria.',
        scheduleSet: (text) => `✅ Programado ${text}. Los resúmenes se enviarán automáticamente a este chat.`,
        errorSetSchedule: '❌ Error estableciendo programación.',
        scheduleCancelled: '✅ Los resúmenes programados han sido cancelados.',
        invalidSchedule: '❌ Opción de programación inválida. Usa /schedule para ver opciones disponibles.',
        notSupportedLanguage: (code) => `❌ El idioma "${code}" no es compatible. Usa /language para ver idiomas disponibles.`,
        notSupportedTimezone: (code) => `❌ La zona horaria "${code}" no es compatible. Usa /timezone para ver zonas horarias disponibles.`,
        pleaseEnterNumber: '❌ Por favor, ingresa un número entre 200 y 5000 caracteres.',
        currentLanguage: (lang) => `🌍 *Idioma Actual:* ${lang}`,
        currentLength: (length) => `📏 *Longitud Actual del Resumen:* ${length} caracteres`,
        currentTimezone: (tz) => `🕐 *Zona Horaria Actual:* ${tz}`,
        currentSchedule: (schedule) => `⏰ *Programación Actual:* ${schedule}`,
        availableLanguages: 'Idiomas disponibles:',
        availableOptions: 'Opciones disponibles:',
        availableTimezones: 'Zonas horarias disponibles:',
        usage: 'Uso:',
        example: 'Ejemplo:',
        note: 'Nota:',
        shorterConcise: 'más cortos y concisos',
        detailed: 'detallados',
        veryComprehensive: 'muy completos'
      },
      'uk': {
        chatSummary: 'Підсумок чату',
        messagesAnalyzed: 'повідомлень',
        summariesRemaining: 'залишилось підсумків сьогодні',
        help: `🤖 *Telegram Bot для підсумків*

*Доступні команди:*

📝 *Генерація підсумків*
• "/summary" - Створити підсумок за останні 24 години
• "/summary 6h" - Підсумок за останні 6 годин
• "/summary today" - Підсумок лише за сьогодні
• "/summary yesterday" - Підсумок за вчора
• "/summary 3d" - Підсумок за останні 3 дні

⚙️ *Налаштування* (Тільки адміністратори)
• "/language [код]" - Встановити мову підсумків
• "/length [число]" - Встановити рівень деталізації
• "/timezone [код]" - Встановити часовий пояс
• "/schedule [опція]" - Налаштувати автоматичні підсумки

📊 *Інформація*
• "/stats" - Показати статистику чату
• "/clear" - Очистити історію чату (Тільки адміністратори)

*Приклади:*
• "/summary 12h" - Останні 12 годин
• "/language uk" - Українські підсумки
• "/length 2000" - Детальні підсумки
• "/schedule daily" - Щоденні автоматичні підсумки

*Підтримувані мови:* en, es, fr, de, it, pt, ru, ja, ko, zh, ar, hi, uk, pl, nl, tr`,
        start: `🤖 *Ласкаво просимо до Telegram Bot для підсумків!*

Я можу створювати підсумки ваших чат-розмов за допомогою штучного інтелекту OpenAI (ChatGPT).

*Як це працює:*
• Я автоматично збираю та зберігаю текстові повідомлення
• Використовуйте "/summary" для створення розумних підсумків
• Підсумки включають ключові теми, важливі моменти та insights

*Швидкий старт:*
• "/summary" - Створити підсумок за останні 24 години
• "/help" - Переглянути всі доступні команди
• "/language [код]" - Встановити вашу улюблену мову

*Приватність:* Я зберігаю лише текстові повідомлення, без медіа або особистих даних.

Спробуйте "/summary" щоб почати! 🚀`,
        noMessages: '📭 Не знайдено повідомлень за вказаний період часу.',
        errorGeneratingSummary: '❌ Помилка при створенні підсумку. Спробуйте ще раз пізніше.',
        dailyLimitReached: (count, limit) => `🚫 Досягнуто денний ліміт підсумків!\n\nВи використали ${count}/${limit} підсумків сьогодні.\n\n⏰ Денний ліміт скидається опівночі (UTC).\n📅 Спробуйте знову завтра або оновіться для необмежених підсумків.\n\n💡 Порада: Використовуйте довші періоди часу (як /summary 7d) для отримання більш повних підсумків.`,
        statsNone: '📊 Ще немає збережених повідомлень. Почніть спілкуватися, щоб побачити статистику!',
        stats: (total, users, first, last, period) => `📊 *Статистика чату*\n\n💬 Всього повідомлень: ${total}\n👥 Унікальних користувачів: ${users}\n📅 Перше повідомлення: ${first}\n🕐 Останнє повідомлення: ${last}\n📈 Період збору: ${period}`,
        errorStats: '❌ Помилка при отриманні статистики.',
        onlyAdmins: '🚫 Тільки адміністратори чату можуть змінювати налаштування бота. Попросіть адміністратора налаштувати.',
        onlyAdminsClear: '🚫 Тільки адміністратори чату можуть очищати історію. Попросіть адміністратора очистити повідомлення.',
        cleared: (count) => `🗑️ Очищено ${count} повідомлень з історії чату.`,
        errorClear: '❌ Помилка при очищенні історії чату.',
        languageSet: (lang) => `✅ Мову встановлено на ${lang}. Майбутні підсумки будуть цією мовою.`,
        errorSetLanguage: '❌ Помилка при встановленні мовних налаштувань.',
        lengthSet: (length, description) => `✅ Довжину підсумку встановлено на ${length} символів. Майбутні підсумки будуть ${description}.`,
        errorSetLength: '❌ Помилка при встановленні довжини підсумку.',
        timezoneSet: (tz) => `✅ Часовий пояс встановлено на ${tz}. Майбутні підсумки будуть використовувати цей часовий пояс для форматування дат.`,
        errorSetTimezone: '❌ Помилка при встановленні часового поясу.',
        scheduleSet: (text) => `✅ Заплановано ${text}. Підсумки будуть автоматично надсилатися в цей чат.`,
        errorSetSchedule: '❌ Помилка при встановленні розкладу.',
        scheduleCancelled: '✅ Заплановані підсумки було скасовано.',
        invalidSchedule: '❌ Неправильна опція розкладу. Використовуйте /schedule щоб побачити доступні опції.',
        notSupportedLanguage: (code) => `❌ Мова "${code}" не підтримується. Використовуйте /language щоб побачити доступні мови.`,
        notSupportedTimezone: (code) => `❌ Часовий пояс "${code}" не підтримується. Використовуйте /timezone щоб побачити доступні часові пояси.`,
        pleaseEnterNumber: '❌ Будь ласка, введіть число між 200 та 5000 символів.',
        currentLanguage: (lang) => `🌍 *Поточна мова:* ${lang}`,
        currentLength: (length) => `📏 *Поточна довжина підсумку:* ${length} символів`,
        currentTimezone: (tz) => `🕐 *Поточний часовий пояс:* ${tz}`,
        currentSchedule: (schedule) => `⏰ *Поточний розклад:* ${schedule}`,
        availableLanguages: 'Доступні мови:',
        availableOptions: 'Доступні опції:',
        availableTimezones: 'Доступні часові пояси:',
        usage: 'Використання:',
        example: 'Приклад:',
        note: 'Примітка:',
        shorterConcise: 'коротші та більш стислі',
        detailed: 'детальні',
        veryComprehensive: 'дуже повні'
      }
      // Add more languages here as needed
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
