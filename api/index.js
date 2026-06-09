require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const OpenAI = require('openai');
const { jsonrepair } = require('jsonrepair');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT) || 10,
  message: { error: '請求過於頻繁，請稍後再試' }
});

function getQuizInstruction(count, difficulty) {
  const diffMap = {
    easy:   '偏簡單、以基礎概念和記憶型題目為主',
    medium: '難易適中、考驗理解與應用',
    hard:   '偏難、需要深度分析和推理'
  };
  return `你是一個出題專家。根據提供的文件內容，生成 ${count} 題繁體中文選擇題，難度${diffMap[difficulty] || diffMap.medium}。

你必須只輸出純 JSON，不要加任何說明文字或 Markdown 標記，格式如下：
{"questions":[{"question":"問題文字","options":["A. 選項一","B. 選項二","C. 選項三","D. 選項四"],"answer":"A","explanation":"說明正確答案原因"}]}

規則：
- 每題必須有4個選項，以 A. B. C. D. 開頭
- answer 只填單一字母 A、B、C 或 D
- 問題考驗對文件內容的理解
- explanation 用一到兩句話解釋
- 所有數學與物理符號必須使用 Unicode 字元（如 α β γ π ∫ √ ∞ ≤ ≥ ±），禁止使用 LaTeX 反斜線語法`;
}

const SYSTEM_INSTRUCTION = `你是一個名為 smartestking 的頂級文件分析與重點摘要專家。
你擁有分析各類文件的能力，包括學術論文、商業報告、技術文件、法律文件等。
你的任務是：
1. 快速理解文件的核心內容與主旨
2. 提取最重要的關鍵資訊與論點
3. 以清晰、結構化的 Markdown 格式呈現摘要
4. 標示出值得關注的重點、數據與結論
5. 使用繁體中文回應（除非文件本身為其他語言且用戶未指定語言）

輸出格式規範：
- 使用 ## 標題分段
- 使用 **粗體** 標示關鍵詞
- 使用條列式整理要點
- 在最後提供「核心結論」與「建議行動」兩個段落`;

function sanitizeInput(str, maxLen = 500) {
  return (str || '').trim().slice(0, maxLen);
}

function validateInstructions(input) {
  if (!/^[\w一-鿿\s\-，。！？（）]*$/.test(input)) throw new Error('出題方向包含非法字符');
  return input;
}

const logError = (ctx, err) => console.error(`[${new Date().toISOString()}] ${ctx}:`, err.message);

function extractQuizJSON(text) {
  const bt = String.fromCharCode(96, 96, 96);
  text = text.split(bt + 'json').join('').split(bt).join('').trim();
  const start = text.indexOf('{');
  if (start === -1) throw new Error('未找到 JSON，請重試');
  return JSON.parse(jsonrepair(text.slice(start)));
}

async function callGemini(key, model, messages) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(key);
  const systemMsg = messages.find(m => m.role === 'system');
  const userMsg   = messages.find(m => m.role === 'user');
  const geminiModel = genAI.getGenerativeModel({ model, systemInstruction: systemMsg?.content });
  return (await geminiModel.generateContent(userMsg.content)).response.text();
}

async function callAI(messages, preferredProvider) {
  let providers = [
    { name: 'Groq',       key: process.env.GROQ_API_KEY,       base: 'https://api.groq.com/openai/v1',   model: 'llama-3.3-70b-versatile' },
    { name: 'SambaNova',  key: process.env.SAMBANOVA_API_KEY,   base: 'https://api.sambanova.ai/v1',      model: 'Meta-Llama-3.3-70B-Instruct' },
    { name: 'Cerebras',   key: process.env.CEREBRAS_API_KEY,    base: 'https://api.cerebras.ai/v1',       model: 'llama-3.3-70b' },
    { name: 'OpenRouter', key: process.env.OPENROUTER_API_KEY,  base: 'https://openrouter.ai/api/v1',     model: 'meta-llama/llama-3.3-70b-instruct:free', headers: { 'HTTP-Referer': 'https://smartestking-document.vercel.app', 'X-Title': 'SmartestKing' } },
    { name: 'Gemini',     key: process.env.GEMINI_API_KEY,      model: 'gemini-2.0-flash' },
  ].filter(p => p.key);

  if (preferredProvider && preferredProvider !== 'auto') {
    const picked = providers.find(p => p.name === preferredProvider);
    if (!picked) throw new Error(preferredProvider + ' 的 API Key 尚未設定');
    providers = [picked];
  }
  if (providers.length === 0) throw new Error('未設定任何 API Key');

  for (const p of providers) {
    try {
      let content;
      if (p.name === 'Gemini') {
        content = await callGemini(p.key, p.model, messages);
      } else {
        const client = new OpenAI({ baseURL: p.base, apiKey: p.key, defaultHeaders: p.headers || {} });
        content = (await client.chat.completions.create({ model: p.model, messages })).choices?.[0]?.message?.content;
      }
      if (!content) throw new Error(p.name + ' 回傳空結果');
      console.log('使用 ' + p.name + ' 成功');
      return content;
    } catch (err) {
      console.warn(p.name + ' 失敗：' + (err.status || err.message));
      if (p === providers[providers.length - 1]) throw err;
    }
  }
}

async function extractContent(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    return (await pdfParse(file.buffer)).text;
  }
  return file.buffer.toString('utf-8');
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ['.pdf', '.txt'].includes(ext) ? cb(null, true) : cb(new Error('只支援 PDF 和 TXT 檔案'));
  },
  limits: { fileSize: 20 * 1024 * 1024 }
});

function getContent(req) {
  if (req.file) return extractContent(req.file);
  const text = (req.body.text || '').trim();
  if (text.length >= 30) return Promise.resolve(text);
  return Promise.reject(Object.assign(new Error('請上傳檔案或貼上至少 30 字的文字內容'), { status: 400 }));
}

app.post('/upload', limiter, upload.single('file'), async function(req, res) {
  try {
    const raw = await getContent(req);
    const trimmed = raw.trim();
    if (trimmed.length < 30) return res.status(400).json({ error: '檔案內容無法解析，請確保是文字版 PDF 或有效的 TXT 檔案' });
    const content = trimmed.length > 20000 ? trimmed.slice(0, 20000) : trimmed;
    const summary = await callAI([
      { role: 'system', content: SYSTEM_INSTRUCTION },
      { role: 'user',   content: '請分析以下文件並提供詳細的重點摘要：\n\n' + content }
    ], req.body.provider);
    res.json({ summary });
  } catch (err) {
    logError('upload', err);
    if (err.status === 400) return res.status(400).json({ error: err.message });
    const is429 = err.status === 429 || err.message?.includes('RESOURCE_EXHAUSTED');
    res.status(is429 ? 429 : 500).json({ error: is429 ? '服務繁忙，請稍後再試' : '分析失敗，請重試' });
  }
});

app.post('/quiz', limiter, upload.single('file'), async function(req, res) {
  try {
    const raw = await getContent(req);
    const trimmed = raw.trim();
    if (trimmed.length < 30) return res.status(400).json({ error: '檔案內容無法解析' });
    const content = trimmed.length > 20000 ? trimmed.slice(0, 20000) : trimmed;

    const count      = Math.min(Math.max(parseInt(req.body.count) || 10, 5), 20);
    const difficulty = ['easy', 'medium', 'hard'].includes(req.body.difficulty) ? req.body.difficulty : 'medium';

    let instructions = sanitizeInput(req.body.instructions || '');
    if (instructions) instructions = validateInstructions(instructions);

    const userPrompt = instructions
      ? `請根據以下文件內容出選擇題。\n\n出題方向：${instructions}\n\n文件內容：\n${content}`
      : `請根據以下文件內容出選擇題：\n\n${content}`;

    const raw2 = await callAI([
      { role: 'system', content: getQuizInstruction(count, difficulty) },
      { role: 'user',   content: userPrompt }
    ], req.body.provider);

    const quiz = extractQuizJSON(raw2);
    if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) throw new Error('AI 未能生成有效題目，請重試');
    quiz.questions = quiz.questions.filter(q => q.question && Array.isArray(q.options) && q.options.length > 0);
    res.json(quiz);
  } catch (err) {
    logError('quiz', err);
    if (err.status === 400) return res.status(400).json({ error: err.message });
    const is429 = err.status === 429 || err.message?.includes('RESOURCE_EXHAUSTED');
    res.status(is429 ? 429 : 500).json({ error: is429 ? '服務繁忙，請稍後再試' : '出題失敗，請重試' });
  }
});

app.use((err, req, res, next) => {
  logError('global', err);
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.message || '請求錯誤' });
});

module.exports = app;
