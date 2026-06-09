require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const OpenAI = require('openai');
const { jsonrepair } = require('jsonrepair');

const app = express();

const QUIZ_INSTRUCTION = `你是一個出題專家。根據提供的文件內容，生成 10 題繁體中文選擇題。

你必須只輸出純 JSON，不要加任何說明文字或 Markdown 標記，格式如下：
{"questions":[{"question":"問題文字","options":["A. 選項一","B. 選項二","C. 選項三","D. 選項四"],"answer":"A","explanation":"說明正確答案原因"}]}

規則：
- 每題必須有4個選項，以 A. B. C. D. 開頭
- answer 只填單一字母 A、B、C 或 D
- 問題考驗對文件內容的理解，難易度均衡
- explanation 用一到兩句話解釋
- 所有數學與物理符號必須使用 Unicode 字元（如 α β γ δ θ λ μ π σ φ ω Δ Σ ∫ ∂ √ ∞ ≠ ≤ ≥ ± × ÷ ²  ³），禁止在 JSON 字串中使用 LaTeX 反斜線語法（如 \\alpha \\frac \\int 等）`;

const SYSTEM_INSTRUCTION = `你是一個名為 smartestking 的頂級文件分析與重點摘要專家。
你擁有分析各類文件的能力，包括學術論文、商業報告、技術文件、法律文件等。
你的任務是：
1. 快速理解文件的核心內容與主旨
2. 提取最重要的關鍵資訊與論點
3. 以清晰、結構化的 Markdown 格式呼現摘要
4. 標示出値得關注的重點、數據與結論
5. 使用繁體中文回應（除非文件本身為其他語言且用戶未指定語言）

輸出格式規範：
- 使用 ## 標題分段
- 使用 **粗體** 標示關鍵詞
- 使用條列式整理要點
- 在最後提供「核心結論」與「建議行動」兩個段落`;

function extractQuizJSON(text) {
  // Remove markdown code fences
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
  const userMsg = messages.find(m => m.role === 'user');
  const geminiModel = genAI.getGenerativeModel({
    model: model,
    systemInstruction: systemMsg ? systemMsg.content : undefined,
  });
  const result = await geminiModel.generateContent(userMsg.content);
  return result.response.text();
}

async function callAI(messages, preferredProvider) {
  let providers = [
    { name: 'Groq', key: process.env.GROQ_API_KEY, base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    { name: 'SambaNova', key: process.env.SAMBANOVA_API_KEY, base: 'https://api.sambanova.ai/v1', model: 'Meta-Llama-3.3-70B-Instruct' },
    { name: 'Cerebras', key: process.env.CEREBRAS_API_KEY, base: 'https://api.cerebras.ai/v1', model: 'llama-3.3-70b' },
    { name: 'OpenRouter', key: process.env.OPENROUTER_API_KEY, base: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', headers: { 'HTTP-Referer': 'https://smartestking-document.vercel.app', 'X-Title': 'SmartestKing' } },
    { name: 'Gemini', key: process.env.GEMINI_API_KEY, model: 'gemini-2.0-flash' },
  ].filter(function(p) { return p.key; });

  if (preferredProvider && preferredProvider !== 'auto') {
    const picked = providers.find(p => p.name === preferredProvider);
    if (!picked) throw new Error(preferredProvider + ' 的 API Key 尚未設定');
    providers = [picked];
  }

  if (providers.length === 0) throw new Error('未設定任何 API Key，請在 Vercel 環境變數加入 GROQ_API_KEY、CEREBRAS_API_KEY 或 GEMINI_API_KEY');

  for (const p of providers) {
    try {
      let content;
      if (p.name === 'Gemini') {
        content = await callGemini(p.key, p.model, messages);
      } else {
        const client = new OpenAI({ baseURL: p.base, apiKey: p.key, defaultHeaders: p.headers || {} });
        const result = await client.chat.completions.create({ model: p.model, messages: messages });
        content = result.choices?.[0]?.message?.content;
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

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.txt'].includes(ext)) { cb(null, true); }
    else { cb(new Error('只支援 PDF 和 TXT 檔案')); }
  },
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.post('/upload', upload.single('file'), async function(req, res) {
  if (!req.file) return res.status(400).json({ error: '請上傳檔案' });
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let fileContent = '';
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse/lib/pdf-parse.js');
      const pdfData = await pdfParse(req.file.buffer);
      fileContent = pdfData.text;
    } else {
      fileContent = req.file.buffer.toString('utf-8');
    }
    const trimmed = fileContent.trim();
    if (trimmed.length < 30) return res.status(400).json({ error: '無法讀取此 PDF 的文字內容。可能是掃描版（圖片）PDF 或數學符號為圖形格式。請改用「文字版」PDF，或將文件內容複製貼上成 .txt 檔後再上傳。' });
    const content = trimmed.length > 20000 ? trimmed.slice(0, 20000) : trimmed;
    const summary = await callAI([
      { role: 'system', content: SYSTEM_INSTRUCTION },
      { role: 'user', content: '請分析以下文件並提供詳細的重點摘要：\n\n' + content }
    ], req.body.provider);
    res.json({ summary: summary });
  } catch (err) {
    console.error('分析錯誤：', err.message);
    const is429 = err.status === 429 || err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED');
    const msg = is429
      ? '目前 AI 服務請求量過高（Rate Limit），請稍等 1 分鐘後再試，或切換其他模型'
      : '分析失敗：' + err.message;
    res.status(err.status === 429 ? 429 : 500).json({ error: msg });
  }
});

app.post('/quiz', upload.single('file'), async function(req, res) {
  if (!req.file) return res.status(400).json({ error: '請上傳檔案' });
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let fileContent = '';
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse/lib/pdf-parse.js');
      const pdfData = await pdfParse(req.file.buffer);
      fileContent = pdfData.text;
    } else {
      fileContent = req.file.buffer.toString('utf-8');
    }
    const trimmed = fileContent.trim();
    if (trimmed.length < 30) return res.status(400).json({ error: '無法讀取此 PDF 的文字內容。可能是掃描版（圖片）PDF 或數學符號為圖形格式。請改用「文字版」PDF，或將文件內容複製貼上成 .txt 檔後再上傳。' });
    const content = trimmed.length > 20000 ? trimmed.slice(0, 20000) : trimmed;
    const instructions = (req.body.instructions || '').trim();
    const userPrompt = instructions
      ? `請根據以下文件內容出選擇題。\n\n出題方向：${instructions}\n\n文件內容：\n${content}`
      : `請根據以下文件內容出選擇題：\n\n${content}`;
    const raw = await callAI([
      { role: 'system', content: QUIZ_INSTRUCTION },
      { role: 'user', content: userPrompt }
    ], req.body.provider);
    const quiz = extractQuizJSON(raw);
    if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      throw new Error('AI 未能生成有效題目，請重試');
    }
    quiz.questions = quiz.questions.filter(q => q.question && Array.isArray(q.options) && q.options.length > 0);
    res.json(quiz);
  } catch (err) {
    console.error('出題錯誤：', err.message);
    const is429 = err.status === 429 || err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED');
    const msg = is429
      ? '目前 AI 服務請求量過高（Rate Limit），請稍等 1 分鐘後再試，或切換其他模型'
      : '出題失敗：' + err.message;
    res.status(err.status === 429 ? 429 : 500).json({ error: msg });
  }
});

app.use((err, req, res, next) => {
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  res.status(status).json({ error: err.message || '請求錯誤' });
});

module.exports = app;
