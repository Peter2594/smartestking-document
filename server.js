require('dotenv').config();
const express = require('express');
const path = require('path');

const AI_KEYS = ['GROQ_API_KEY', 'SAMBANOVA_API_KEY', 'CEREBRAS_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY'];
if (!AI_KEYS.some(k => process.env[k])) {
  console.error('未設定任何 AI API Key，請在 .env 加入至少一組 Key');
  process.exit(1);
}

const app = require('./api/index');
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`smartestking 啟動中：http://localhost:${PORT}`));
