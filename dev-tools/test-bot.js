// Simple test script to verify bot functionality
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

async function testBot() {
  const token = process.env.BOT_TOKEN;
  
  if (!token) {
    console.error('❌ BOT_TOKEN not found in .env file');
    process.exit(1);
  }

  try {
    const bot = new TelegramBot(token);
    const me = await bot.getMe();
    
    console.log('✅ Bot connection successful!');
    console.log(`🤖 Bot username: @${me.username}`);
    console.log(`📝 Bot name: ${me.first_name}`);
    console.log(`🆔 Bot ID: ${me.id}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Bot connection failed:', error.message);
    process.exit(1);
  }
}

testBot();
