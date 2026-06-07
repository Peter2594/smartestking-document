require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const OpenAI = require('openai');

const app = express();

const QUIZ_INSTRUCTION = `你是一個出題專家。根據提供的文件內容，生成 6 到 8 題繁體中文選擇題。

你必須只輸出純 JSON，不要加任何說明文字或 Markdown 標記，格式如下：
{"questions":[{"question":"問題文字","options":["A. 選項一","B. 選項二","C. 選項三","D. 選項四"],"answer":"A","explanation":"說明正確答案原因"}]}

規則：
- 每題必須有 4 個選項，以 A. B. C. D. 開頭
- answer 只填單一字母 A、B、C 或 D
- 問題考驗對文件內容的理解，難易度均衡
- explanation 用一到兩句話解釋`;

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

async function callAI(messages) {
  const providers = [
    { name: 'Groq', key: process.env.GROQ_API_KEY, base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    { name: 'Cerebras', key: process.env.CEREBRAS_API_KEY, base: 'https://api.cerebras.ai/v1', model: 'llama-3.3-70b' },
  ].filter(p => p.key);

  if (providers.length === 0) throw new Error('未設定任何 API Key，請在 Vercel 環境變數加入 GROQ_API_KEY');

  for (const p of providers) {
    try {
      const client = new OpenAI({ baseURL: p.base, apiKey: p.key });
      const result = await client.chat.completions.create({ model: p.model, messages });
      console.log(`使用 ${p.name} 成功`);
      return result.choices[0].message.content;
    } catch (err) {
      console.warn(`${p.name} 失敗，嘗試下一個...`);
      if (p === providers[providers.length - 1]) throw err;
    }
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.txt'].includes(ext)) { cb(null, true); }
    else { cb(new Error('只支援 PDF 和 TXT 檔案')); }
  },
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '請上傳檔案' });
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let fileContent = '';
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const pdfData = await pdfParse(req.file.buffer);
      fileContent = pdfData.text;
    } else {
      fileContent = req.file.buffer.toString('utf-8');
    }
    if (!fileContent.trim()) return res.status(400).json({ error: '檔案內容為空或無法讀取文字' });
    const summary = await callAI([
      { role: 'system', content: SYSTEM_INSTRUCTION },
      { role: 'user', content: `請分析以下文件並提供詳細的重點摘要：\n\n${fileContent}` }
    ]);
    res.json({ summary });
  } catch (err) {
    console.error('分析錯誤：', err.message);
    res.status(500).json({ error: '分析失敗：' + err.message });
  }
});

app.post('/quiz', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '請上傳檔案' });
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let fileContent = '';
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const pdfData = await pdfParse(req.file.buffer);
      fileContent = pdfData.text;
    } else {
      fileContent = req.file.buffer.toString('utf-8');
    }
    if (!fileContent.trim()) return res.status(400).json({ error: '檔案內容為空或無法讀取文字' });
    const raw = await callAI([
      { role: 'system', content: QUIZ_INSTRUCTION },
      { role: 'user', content: `請根據以下文件內容出選擇題：\n\n${fileContent}` }
    ]);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI 回應格式錯誤，請重試');
    const quiz = JSON.parse(match[0]);
    res.json(quiz);
  } catch (err) {
    console.error('出題錯誤：', err.message);
    res.status(500).json({ error: '出題失敗：' + err.message });
  }
});

module.exports = app;
