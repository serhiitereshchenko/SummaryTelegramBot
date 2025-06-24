// Simple test script to verify OpenAI API
require('dotenv').config();
const OpenAI = require('openai');

async function testOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY not found in .env file');
    process.exit(1);
  }

  try {
    const openai = new OpenAI({ apiKey });
    
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "user", content: "Say hello!" }
      ],
      max_tokens: 10
    });
    
    console.log('✅ OpenAI connection successful!');
    console.log(`🤖 Response: ${response.choices[0].message.content}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ OpenAI connection failed:', error.message);
    process.exit(1);
  }
}

testOpenAI();
