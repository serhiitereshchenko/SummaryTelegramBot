#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing deployment configuration...\n');

let allTestsPassed = true;

// Test 1: Check if required files exist
console.log('📁 Checking required files...');
const requiredFiles = [
  'package.json',
  'index.js',
  'src/database.js',
  'src/commandHandler.js',
  'src/messageHandler.js',
  'src/summaryService.js',
  'src/scheduler.js',
  'src/logger.js',
  'migrations/init.js',
  'migrations/add_timezone_column.js',
  'Dockerfile',
  'docker-compose.yml',
  '.dockerignore'
];

requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    allTestsPassed = false;
  }
});

// Test 2: Check package.json
console.log('\n📦 Checking package.json...');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  if (packageJson.main === 'index.js') {
    console.log('  ✅ Main entry point is correct');
  } else {
    console.log('  ❌ Main entry point should be index.js');
    allTestsPassed = false;
  }
  
  if (packageJson.scripts.start === 'node index.js') {
    console.log('  ✅ Start script is correct');
  } else {
    console.log('  ❌ Start script should be "node index.js"');
    allTestsPassed = false;
  }
  
  const requiredDeps = ['node-telegram-bot-api', 'openai', 'sqlite3', 'moment-timezone', 'winston'];
  requiredDeps.forEach(dep => {
    if (packageJson.dependencies[dep]) {
      console.log(`  ✅ ${dep} dependency found`);
    } else {
      console.log(`  ❌ ${dep} dependency missing`);
      allTestsPassed = false;
    }
  });
} catch (error) {
  console.log('  ❌ Error reading package.json:', error.message);
  allTestsPassed = false;
}

// Test 3: Check Docker configuration
console.log('\n🐳 Checking Docker configuration...');
try {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
  if (dockerfile.includes('FROM node:18-alpine')) {
    console.log('  ✅ Base image is correct');
  } else {
    console.log('  ❌ Should use node:18-alpine base image');
    allTestsPassed = false;
  }
  
  if (dockerfile.includes('ENTRYPOINT')) {
    console.log('  ✅ Entrypoint script is configured');
  } else {
    console.log('  ❌ Entrypoint script missing');
    allTestsPassed = false;
  }
} catch (error) {
  console.log('  ❌ Error reading Dockerfile:', error.message);
  allTestsPassed = false;
}

// Test 4: Check environment file
console.log('\n🔧 Checking environment configuration...');
if (fs.existsSync('.env')) {
  console.log('  ✅ .env file exists');
  
  const envContent = fs.readFileSync('.env', 'utf8');
  if (envContent.includes('BOT_TOKEN=')) {
    console.log('  ✅ BOT_TOKEN is configured');
  } else {
    console.log('  ❌ BOT_TOKEN is missing');
    allTestsPassed = false;
  }
  
  if (envContent.includes('OPENAI_API_KEY=')) {
    console.log('  ✅ OPENAI_API_KEY is configured');
  } else {
    console.log('  ❌ OPENAI_API_KEY is missing');
    allTestsPassed = false;
  }
} else {
  console.log('  ⚠️  .env file not found - please copy env.example to .env and configure');
}

// Test 5: Check directory structure
console.log('\n📂 Checking directory structure...');
const requiredDirs = ['src', 'migrations', 'logs'];
requiredDirs.forEach(dir => {
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    console.log(`  ✅ ${dir}/ directory exists`);
  } else {
    console.log(`  ❌ ${dir}/ directory missing`);
    allTestsPassed = false;
  }
});

// Test 6: Check if Docker is available
console.log('\n🐳 Checking Docker availability...');
const { execSync } = require('child_process');
try {
  execSync('docker --version', { stdio: 'pipe' });
  console.log('  ✅ Docker is available');
  
  execSync('docker-compose --version', { stdio: 'pipe' });
  console.log('  ✅ Docker Compose is available');
} catch (error) {
  console.log('  ❌ Docker or Docker Compose not available');
  console.log('     Please install Docker and Docker Compose');
  allTestsPassed = false;
}

// Final result
console.log('\n' + '='.repeat(50));
if (allTestsPassed) {
  console.log('🎉 All tests passed! Your deployment is ready.');
  console.log('\n📋 Next steps:');
  console.log('  1. Ensure your .env file is properly configured');
  console.log('  2. Run: ./deploy.sh');
  console.log('  3. Or manually: docker-compose up -d');
} else {
  console.log('❌ Some tests failed. Please fix the issues above before deploying.');
  process.exit(1);
} 