const logger = require('./logger');

class MessageHandler {
  constructor(database) {
    this.db = database;
  }

  async handleMessage(msg) {
    // Skip if message doesn't have text or is a command
    if (!msg.text || msg.text.startsWith('/')) {
      return;
    }

    // Skip if message is too old (more than 24 hours)
    const messageAge = Date.now() / 1000 - msg.date;
    if (messageAge > 86400) { // 24 hours
      return;
    }

    const messageData = {
      message_id: msg.message_id,
      chat_id: msg.chat.id,
      user_id: msg.from?.id,
      username: msg.from?.username,
      first_name: msg.from?.first_name,
      last_name: msg.from?.last_name,
      text: msg.text,
      timestamp: msg.date,
      message_type: 'text'
    };

    try {
      await this.db.saveMessage(messageData);
      logger.debug(`Saved message from chat ${msg.chat.id}`);
    } catch (error) {
      logger.error('Error saving message:', error);
    }
  }
}

module.exports = MessageHandler;
