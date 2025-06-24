#!/bin/bash

# Telegram Summary Bot - Docker Deployment Script
# This script handles the complete deployment process

set -e  # Exit on any error

echo "🚀 Starting Telegram Summary Bot Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env file exists
if [ ! -f .env ]; then
    print_error ".env file not found!"
    echo "Please create a .env file with the following variables:"
    echo "BOT_TOKEN=your_telegram_bot_token"
    echo "OPENAI_API_KEY=your_openai_api_key"
    echo "BOT_OWNER_ID=your_telegram_user_id"
    echo "DATABASE_PATH=./chat_data.db"
    exit 1
fi

# Check if required environment variables are set
print_status "Checking environment variables..."
source .env

if [ -z "$BOT_TOKEN" ]; then
    print_error "BOT_TOKEN is not set in .env file"
    exit 1
fi

if [ -z "$OPENAI_API_KEY" ]; then
    print_error "OPENAI_API_KEY is not set in .env file"
    exit 1
fi

print_success "Environment variables are properly configured"

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose down --remove-orphans || true

# Clean up old images (optional)
read -p "Do you want to remove old Docker images? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Removing old images..."
    docker system prune -f || true
fi

# Build the Docker image
print_status "Building Docker image..."
docker-compose build --no-cache

if [ $? -ne 0 ]; then
    print_error "Docker build failed!"
    exit 1
fi

print_success "Docker image built successfully"

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p logs data

# Set proper permissions
chmod 755 logs data

# Start the container
print_status "Starting the bot container..."
docker-compose up -d

if [ $? -ne 0 ]; then
    print_error "Failed to start container!"
    exit 1
fi

# Wait for container to be ready
print_status "Waiting for container to be ready..."
sleep 10

# Check container status
print_status "Checking container status..."
if docker-compose ps | grep -q "Up"; then
    print_success "Container is running successfully"
else
    print_error "Container failed to start properly"
    docker-compose logs
    exit 1
fi

# Run database migrations
print_status "Running database migrations..."
docker-compose exec telegram-bot node migrations/init.js

if [ $? -eq 0 ]; then
    print_success "Database initialized successfully"
else
    print_warning "Database initialization failed or already exists"
fi

# Run timezone migration
print_status "Running timezone migration..."
docker-compose exec telegram-bot node migrations/add_timezone_column.js

if [ $? -eq 0 ]; then
    print_success "Timezone migration completed"
else
    print_warning "Timezone migration failed or already exists"
fi

# Show logs
print_status "Showing recent logs..."
docker-compose logs --tail=20

# Final status check
print_status "Performing final health check..."
sleep 5

if docker-compose ps | grep -q "Up"; then
    print_success "🎉 Deployment completed successfully!"
    echo ""
    echo "📋 Deployment Summary:"
    echo "  ✅ Docker image built"
    echo "  ✅ Container started"
    echo "  ✅ Database initialized"
    echo "  ✅ Bot is running"
    echo ""
    echo "🔧 Useful commands:"
    echo "  docker-compose logs -f          # Follow logs"
    echo "  docker-compose restart          # Restart bot"
    echo "  docker-compose down             # Stop bot"
    echo "  docker-compose up -d            # Start bot"
    echo ""
    echo "📁 Data locations:"
    echo "  Database: ./data/chat_data.db"
    echo "  Logs: ./logs/"
    echo ""
    print_success "Your Telegram bot is now running! 🚀"
else
    print_error "Deployment failed! Container is not running."
    docker-compose logs
    exit 1
fi 