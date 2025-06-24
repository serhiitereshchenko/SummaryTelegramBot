const Database = require('../src/database');

async function runMigrations() {
  console.log('🔄 Initializing database...');
  
  try {
    const db = new Database();
    await db.init();
    console.log('✅ Database initialized successfully');
    console.log('📍 Database location:', process.env.DATABASE_PATH || './chat_data.db');
    db.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runMigrations();
}
