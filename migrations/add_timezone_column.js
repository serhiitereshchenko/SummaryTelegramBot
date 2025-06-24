const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function addTimezoneColumn() {
  console.log('🔄 Adding timezone column to chat_settings table...');
  
  const dbPath = process.env.DATABASE_PATH || './chat_data.db';
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    // Check if timezone column already exists
    db.get("PRAGMA table_info(chat_settings)", (err, rows) => {
      if (err) {
        console.error('❌ Error checking table schema:', err);
        db.close();
        reject(err);
        return;
      }
      
      // Get all columns
      db.all("PRAGMA table_info(chat_settings)", (err, columns) => {
        if (err) {
          console.error('❌ Error getting table columns:', err);
          db.close();
          reject(err);
          return;
        }
        
        const hasTimezoneColumn = columns.some(col => col.name === 'timezone');
        
        if (hasTimezoneColumn) {
          console.log('✅ Timezone column already exists');
          db.close();
          resolve();
          return;
        }
        
        // Add timezone column
        const sql = 'ALTER TABLE chat_settings ADD COLUMN timezone TEXT DEFAULT "UTC"';
        
        db.run(sql, function(err) {
          if (err) {
            console.error('❌ Error adding timezone column:', err);
            db.close();
            reject(err);
            return;
          }
          
          console.log('✅ Timezone column added successfully');
          console.log('📍 Database location:', dbPath);
          db.close();
          resolve();
        });
      });
    });
  });
}

if (require.main === module) {
  addTimezoneColumn()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addTimezoneColumn; 