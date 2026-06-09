const ExportManager = {
  _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click();
    URL.revokeObjectURL(url); a.remove();
  },
  markdown(content, filename) {
    this._download(new Blob([content], { type: 'text/markdown;charset=utf-8' }), filename + '.md');
  },
  html(content, filename) {
    const body = marked.parse(content);
    const page = `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>${filename}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.7;margin:40px auto;max-width:800px;color:#333}h1,h2{color:#222;border-bottom:1px solid #eee;padding-bottom:8px}h3{color:#444}code{background:#f5f5f5;padding:2px 6px;border-radius:3px;font-size:0.9em}pre{background:#f5f5f5;padding:16px;overflow-x:auto;border-radius:6px}blockquote{border-left:3px solid #888;padding-left:16px;color:#666;margin:16px 0}ul,ol{padding-left:1.5em}</style></head><body>${body}</body></html>`;
    this._download(new Blob([page], { type: 'text/html;charset=utf-8' }), filename + '.html');
  },
  print(contentEl) {
    const win = window.open('', '', 'width=900,height=700');
    if (!win) { alert('請允許彈出視窗以使用列印功能'); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.7;margin:40px auto;max-width:800px;color:#333}h1,h2{color:#222}h3{color:#444}code{background:#f5f5f5;padding:2px 6px;border-radius:3px}pre{background:#f5f5f5;padding:16px;overflow-x:auto;border-radius:6px}blockquote{border-left:3px solid #888;padding-left:16px;color:#666}ul,ol{padding-left:1.5em}@media print{body{margin:20px}}</style></head><body>${contentEl.innerHTML}</body></html>`);
    win.document.close(); win.focus(); win.print();
  }
};
