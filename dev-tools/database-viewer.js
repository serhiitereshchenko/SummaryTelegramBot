// Simple database viewer for debugging
require('dotenv').config();
const Database = require('../src/database');

async function viewDatabase() {
  const db = new Database();
  
  try {
    await db.init();
    
    // Get all chats
    const sql = `
      SELECT 
        chat_id, 
        COUNT(*) as message_count,
        MIN(timestamp) as first_message,
        MAX(timestamp) as last_message
      FROM messages 
      GROUP BY chat_id
      ORDER BY message_count DESC
    `;
    
    const chats = await new Promise((resolve, reject) => {
      db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('📊 Database Statistics:');
    console.log('======================');
    
    if (chats.length === 0) {
      console.log('📭 No data found in database');
    } else {
      chats.forEach(chat => {
        const firstDate = new Date(chat.first_message * 1000).toLocaleString();
        const lastDate = new Date(chat.last_message * 1000).toLocaleString();
        
        console.log(`\n💬 Chat ID: ${chat.chat_id}`);
        console.log(`   Messages: ${chat.message_count}`);
        console.log(`   First: ${firstDate}`);
        console.log(`   Last: ${lastDate}`);
      });
    }
    
    db.close();
  } catch (error) {
    console.error('❌ Database error:', error);
    process.exit(1);
  }
}

viewDatabase();
