#!/bin/sh

echo "🔄 Running database migrations..."
node migrations/init.js || echo "⚠️  Database init failed or already exists"
node migrations/add_timezone_column.js || echo "⚠️  Timezone migration failed or already exists"
echo "🚀 Starting bot..."
exec npm start 