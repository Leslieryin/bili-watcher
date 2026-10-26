// 内容脚本:在 B 站页面注入一个轻量悬浮提示,展示最近一次总结。
// 只读 DOM,不修改页面业务数据,不做任何自动化点击/评论。
(() => {
  const HOST_ID = 'bili-watcher-toast';
  if (document.getElementById(HOST_ID)) return;

  const box = document.createElement('div');
  box.id = HOST_ID;
  box.style.cssText = [
    'position:fixed',
    'right:16px',
    'bottom:16px',
    'z-index:2147483646',
    'max-width:340px',
    'padding:12px 14px',
    'background:rgba(24,25,28,.94)',
    'color:#e8e8ea',
    'font:13px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
    'border:1px solid rgba(255,255,255,.12)',
    'border-radius:10px',
    'box-shadow:0 8px 28px rgba(0,0,0,.45)',
    'display:none',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'B站观影总结器';
  title.style.cssText = 'font-weight:600;color:#00a1d6;margin-bottom:6px';

  const body = document.createElement('div');
  body.style.cssText = 'white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto';

  const close = document.createElement('span');
  close.textContent = '×';
  close.style.cssText =
    'position:absolute;top:6px;right:10px;cursor:pointer;color:#888;font-size:16px';
  close.onclick = () => (box.style.display = 'none');

  box.append(close, title, body);

  function mount() {
    if (!document.body) return;
    document.body.appendChild(box);
  }
  mount();
  if (!document.body.contains(box)) {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  }

  // 由 popup 触发在页面内展示结果
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'SHOW_SUMMARY' && msg.record) {
      title.textContent = `@铃芽之鱼 · ${msg.record.bvid}`;
      body.textContent = msg.record.summary;
      box.style.display = 'block';
    }
  });
})();
