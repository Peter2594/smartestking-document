// ── state ────────────────────────────────────────────────
let inputModeAnalyze = 'file';
let inputModeQuiz    = 'file';
let quizCount        = 10;
let quizDifficulty   = 'medium';
let lastSummaryContent = '';
let quizData = null;

// ── tabs ─────────────────────────────────────────────────
function switchTab(t) {
  const ids = ['analyze', 'quiz', 'history'];
  document.querySelectorAll('.tab').forEach((el, i) => el.classList.toggle('active', t === ids[i]));
  ids.forEach(id => document.getElementById(id + '-section').classList.toggle('active', t === id));
  if (t === 'history') loadHistory();
}

// ── input mode toggle ─────────────────────────────────────
function setInputMode(section, mode) {
  const isAnalyze = section === 'analyze';
  const prefix = isAnalyze ? 'a' : 'q';
  if (isAnalyze) inputModeAnalyze = mode; else inputModeQuiz = mode;
  document.getElementById(prefix + '-drop-wrap').style.display  = mode === 'file' ? 'block' : 'none';
  document.getElementById(prefix + '-text-wrap').style.display  = mode === 'text' ? 'block' : 'none';
  const btn = document.getElementById(prefix + '-btn');
  if (mode === 'file') {
    btn.disabled = isAnalyze ? !az.get() : !qz.get();
  } else {
    btn.disabled = !document.getElementById(prefix + '-text').value.trim();
  }
  document.querySelectorAll('#' + prefix + '-input-toggle .itog').forEach((el, i) =>
    el.classList.toggle('active', (mode === 'file') === (i === 0)));
}

// ── quiz options ──────────────────────────────────────────
function setCount(n) {
  quizCount = n;
  document.querySelectorAll('#count-chips .chip').forEach((el, i) =>
    el.classList.toggle('active', [5, 10, 15][i] === n));
}

function setDiff(d) {
  quizDifficulty = d;
  document.querySelectorAll('#diff-chips .chip').forEach((el, i) =>
    el.classList.toggle('active', ['easy', 'medium', 'hard'][i] === d));
}

// ── file drop zones ───────────────────────────────────────
function makeZone(dropId, inputId, infoId, nameId, btnId) {
  const drop = document.getElementById(dropId), input = document.getElementById(inputId);
  const info = document.getElementById(infoId), nameEl = document.getElementById(nameId);
  const btn  = document.getElementById(btnId);
  let file = null;
  function set(f) {
    if (!f) return;
    if (!['pdf','txt'].includes(f.name.split('.').pop().toLowerCase())) { alert('只支援 PDF 和 TXT'); return; }
    if (f.size > 20 * 1024 * 1024) { alert('檔案大小不能超過 20MB'); return; }
    file = f;
    nameEl.textContent = f.name + ' (' + (f.size / 1024).toFixed(1) + ' KB)';
    info.classList.add('visible');
    btn.disabled = false;
  }
  drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop',      e => { e.preventDefault(); drop.classList.remove('drag-over'); set(e.dataTransfer.files[0]); });
  input.addEventListener('change',   () => set(input.files[0]));
  return { get: () => file };
}

const az = makeZone('a-drop','a-input','a-info','a-fname','a-btn');
const qz = makeZone('q-drop','q-input','q-info','q-fname','q-btn');

// text area → enable button
document.getElementById('a-text').addEventListener('input', () => {
  if (inputModeAnalyze === 'text') document.getElementById('a-btn').disabled = !document.getElementById('a-text').value.trim();
});
document.getElementById('q-text').addEventListener('input', () => {
  if (inputModeQuiz === 'text') document.getElementById('q-btn').disabled = !document.getElementById('q-text').value.trim();
});

// ── helpers ───────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildFormData(prefix, extra = {}) {
  const fd = new FormData();
  if (prefix === 'a') {
    if (inputModeAnalyze === 'file') fd.append('file', az.get());
    else fd.append('text', document.getElementById('a-text').value.trim());
  } else {
    if (inputModeQuiz === 'file') fd.append('file', qz.get());
    else fd.append('text', document.getElementById('q-text').value.trim());
  }
  fd.append('provider', document.getElementById('model-select').value);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return fd;
}

// ── analyze ───────────────────────────────────────────────
document.getElementById('a-btn').addEventListener('click', async () => {
  const btn = document.getElementById('a-btn'), st = document.getElementById('a-status'), rc = document.getElementById('a-result');
  btn.disabled = true; rc.style.display = 'none';
  st.innerHTML = '<span class="spinner"></span>分析中，請稍候...'; st.className = 'status';
  try {
    const res  = await fetch('/upload', { method: 'POST', body: buildFormData('a') });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '伺服器錯誤');
    lastSummaryContent = data.summary;
    document.getElementById('a-content').innerHTML = marked.parse(data.summary);
    rc.style.display = 'block'; st.innerHTML = '';
    rc.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const fname = inputModeAnalyze === 'file' ? az.get()?.name : '貼上文字';
    db.save({ filename: fname || '-', filesize: 0, type: 'summary', content: data.summary, provider: document.getElementById('model-select').value }).catch(() => {});
  } catch (e) { st.textContent = e.message; st.className = 'status error'; }
  finally { btn.disabled = false; }
});

document.getElementById('export-md').addEventListener('click',    () => ExportManager.markdown(lastSummaryContent, '分析結果'));
document.getElementById('export-html').addEventListener('click',  () => ExportManager.html(lastSummaryContent, '分析結果'));
document.getElementById('export-print').addEventListener('click', () => ExportManager.print(document.getElementById('a-content')));

// ── quiz ──────────────────────────────────────────────────
async function generateQuiz() {
  const btn = document.getElementById('q-btn'), st = document.getElementById('q-status');
  btn.disabled = true;
  document.getElementById('q-card').style.display   = 'none';
  document.getElementById('q-result').style.display = 'none';
  st.innerHTML = '<span class="spinner"></span>生成考題中，請稍候...'; st.className = 'status';
  try {
    const res  = await fetch('/quiz', { method: 'POST', body: buildFormData('q', {
      count: quizCount, difficulty: quizDifficulty,
      instructions: document.getElementById('q-instructions').value.trim()
    })});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '伺服器錯誤');
    quizData = data.questions;
    if (!quizData?.length) throw new Error('AI 未能生成有效題目，請重試');
    renderQuiz(quizData);
    document.getElementById('q-card').style.display = 'block'; st.textContent = '';
    document.getElementById('q-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const fname = inputModeQuiz === 'file' ? qz.get()?.name : '貼上文字';
    db.save({ filename: fname || '-', filesize: 0, type: 'quiz', content: quizData.length + '題', provider: document.getElementById('model-select').value }).catch(() => {});
  } catch (e) { st.textContent = e.message; st.className = 'status error'; }
  finally { btn.disabled = false; }
}

document.getElementById('q-btn').addEventListener('click', generateQuiz);

function renderQuiz(qs) {
  const letters = ['A','B','C','D'];
  document.getElementById('q-questions').innerHTML = qs.map((q, i) => `
    <div class="question-block" id="qb${i}">
      <div class="question-text"><span class="q-num">${i+1}.</span>${esc(q.question)}</div>
      <div class="options">${(q.options || []).map((opt, j) => `
        <label class="opt-label" id="ql${i}_${j}">
          <input type="radio" name="q${i}" value="${letters[j]}" onchange="selectOpt(${i},${j})"> ${esc(opt)}
        </label>`).join('')}
      </div>
      <div class="explanation" id="qe${i}">${esc(q.explanation)}</div>
    </div>`).join('');
  document.getElementById('q-submit').style.display = 'block';
}

function selectOpt(qi, oi) {
  for (let j = 0; j < 4; j++) document.getElementById(`ql${qi}_${j}`)?.classList.toggle('selected', j === oi);
}

document.getElementById('q-submit').addEventListener('click', () => {
  if (!quizData) return;
  const letters = ['A','B','C','D'];
  let score = 0;
  const wrongQs = [];
  quizData.forEach((q, i) => {
    const sel    = document.querySelector(`input[name="q${i}"]:checked`);
    const ansIdx = letters.indexOf(q.answer);
    const block  = document.getElementById(`qb${i}`);
    const ok     = sel && (sel.value || '').trim() === (q.answer || '').trim();
    if (ok) { score++; block.classList.add('correct'); }
    else {
      block.classList.add('wrong');
      wrongQs.push({ q, sel: sel?.value });
      if (sel) document.getElementById(`ql${i}_${letters.indexOf(sel.value)}`)?.classList.add('wrong-opt');
    }
    if (!ok) document.getElementById(`ql${i}_${ansIdx}`)?.classList.add('correct-opt');
    if (sel && ok) document.getElementById(`ql${i}_${letters.indexOf(sel.value)}`)?.classList.add('correct-opt');
    document.getElementById(`qe${i}`).classList.add('visible');
    document.querySelectorAll(`input[name="q${i}"]`).forEach(r => r.disabled = true);
  });
  document.getElementById('q-score').textContent = `${score} / ${quizData.length}`;
  document.getElementById('q-result').style.display = 'block';
  document.getElementById('q-submit').style.display = 'none';
  const wr = document.getElementById('wrong-review');
  if (wrongQs.length) { renderWrongReview(wrongQs, letters); wr.style.display = 'block'; }
  else wr.style.display = 'none';
  document.getElementById('q-result').scrollIntoView({ behavior: 'smooth' });
});

function renderWrongReview(wrongQs, letters) {
  document.getElementById('wrong-list').innerHTML = wrongQs.map(({ q, sel }) => {
    const correctIdx = letters.indexOf(q.answer);
    const selIdx     = sel ? letters.indexOf(sel) : -1;
    return `<div class="wrong-item">
      <div class="wrong-q-text">${esc(q.question)}</div>
      ${selIdx >= 0 ? `<div class="wrong-ans incorrect">你的答案：${esc(q.options[selIdx] || sel)}</div>` : '<div class="wrong-ans incorrect">未作答</div>'}
      <div class="wrong-ans correct-ans">正確答案：${esc(q.options[correctIdx] || q.answer)}</div>
      <div class="wrong-expl">${esc(q.explanation)}</div>
    </div>`;
  }).join('');
}

function retakeQuiz() { generateQuiz(); }

// ── history ───────────────────────────────────────────────
function fmtDate(ts) {
  return new Date(ts).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function loadHistory() {
  const list = await db.getAll().catch(() => []);
  const el = document.getElementById('history-list');
  if (!list.length) { el.innerHTML = '<p style="color:#666;text-align:center;padding:24px">暫無記錄</p>'; return; }
  el.innerHTML = list.map(a => `
    <div class="history-item">
      <div class="history-item-header" onclick="toggleDetail(${a.id})">
        <div>
          <div class="history-filename">${esc(a.filename)}</div>
          <div class="history-meta">${fmtDate(a.timestamp)} · ${a.type === 'quiz' ? '考題 ' + esc(a.content) : '分析'} · ${esc(a.provider || '-')}</div>
        </div>
        <button class="export-btn" onclick="event.stopPropagation();delHistory(${a.id})">刪除</button>
      </div>
      <div class="history-detail" id="hd-${a.id}">
        ${a.type === 'summary'
          ? '<div class="markdown-body" style="font-size:0.88rem;margin-top:4px">' + marked.parse(a.content || '') + '</div>'
          : '<p style="color:#888;font-size:0.85rem;padding-top:8px">考題記錄不含題目內容</p>'}
      </div>
    </div>`).join('');
  if (navigator.storage?.estimate) {
    navigator.storage.estimate().then(e => {
      document.getElementById('storage-info').textContent = `本地已使用 ${(e.usage / 1024 / 1024).toFixed(1)} MB`;
    }).catch(() => {});
  }
}

function toggleDetail(id) {
  const el = document.getElementById('hd-' + id);
  if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

async function delHistory(id) {
  await db.delete(id).catch(() => {});
  loadHistory();
}

async function clearAllHistory() {
  if (!confirm('確定要清除所有記錄？此操作無法恢復。')) return;
  await db.clear().catch(() => {});
  loadHistory();
}
