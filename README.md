# SmartestKing — AI 文件分析工具

上傳 PDF 或 TXT 文件，由 Gemini AI 自動生成結構化重點摘要。

## 環境需求

- Node.js 18+
- Google Gemini API Key（免費申請：https://aistudio.google.com）

## 安裝步驟

```bash
# 1. 進入專案目錄
cd smartestking-document

# 2. 安裝相依套件
npm install

# 3. 設定 API Key
#    打開 .env 檔，將 your_gemini_api_key_here 換成你的真實 Key
```

## .env 設定

```
GEMINI_API_KEY=你的_Gemini_API_Key
PORT=3000
```

### 取得 Gemini API Key

1. 前往 https://aistudio.google.com
2. 登入 Google 帳號
3. 點擊左側「Get API Key」
4. 建立或選擇專案，複製 API Key
5. 貼入 `.env` 檔中

## 啟動

```bash
npm start
```

開啟瀏覽器前往 http://localhost:3000

## 使用方式

1. 拖曳或點擊上傳 PDF / TXT 檔案（最大 20MB）
2. 點擊「開始分析」
3. 等待 AI 分析完成，查看 Markdown 格式摘要

## 專案結構

```
smartestking-document/
├── server.js          # Express 後端，/upload API
├── public/
│   └── index.html     # 前端 UI
├── uploads/           # 暫存上傳檔案（自動清理）
├── .env               # API Key 設定（不要 commit）
├── package.json
└── README.md
```
