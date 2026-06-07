require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

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

const PROVIDERS = [
  {
    name: 'Groq',
    client: () => new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY }),
    model: 'llama-3.3-70b-versatile',
    enabled: () => !!process.env.GROQ_API_KEY
  },
  {
    name: 'Gemini',
    client: () => new OpenAI({ baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', apiKey: process.env.GEMINI_API_KEY }),
    model: 'gemini-2.0-flash',
    enabled: () => !!process.env.GEMINI_API_KEY
  },
  {
    name: 'Cerebras',
    client: () => new OpenAI({ baseURL: 'https://api.cerebras.ai/v1', apiKey: process.env.CEREBRAS_API_KEY }),
    model: 'llama-3.3-70b',
    enabled: () => !!process.env.CEREBRAS_API_KEY
  }
];

async function callAI(messages) {
  const active = PROVIDERS.filter(p => p.enabled());
  if (active.length === 0) throw new Error('未設定任何 API Key');

  for (const provider of active) {
    try {
      const result = await provider.client().chat.completions.create({
        model: provider.model,
        messages
      });
      console.log(`使用 ${provider.name} 成功`);
      return result.choices[0].message.content;
    } catch (err) {
      const status = err.status || err.response?.status;
      console.warn(`${provider.name} 失敗 (${status})，嘗試下一個...`);
      if (provider === active[active.length - 1]) throw err;
    }
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.txt'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只支援 PDF 和 TXT 檔案'));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '請上傳檔案' });
  }

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

    if (!fileContent.trim()) {
      return res.status(400).json({ error: '檔案內容為空或無法讀取文字' });
    }

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

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`smartestking 啟動中：http://localhost:${PORT}`);
  });
}
