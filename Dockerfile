FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache curl sqlite

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create directories
RUN mkdir -p logs data

# Make entrypoint script executable
RUN chmod +x /app/entrypoint.sh

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S botuser -u 1001

# Change ownership
RUN chown -R botuser:nodejs /app
USER botuser

# Set environment variables
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/chat_data.db

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

# Start the bot with entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
