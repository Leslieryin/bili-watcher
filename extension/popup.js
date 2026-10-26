// popup 控制面板逻辑
const $ = (id) => document.getElementById(id);

function send(type, extra = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...extra }, (res) => resolve(res));
  });
}

function setStatus(text) {
  $('status').textContent = text || '—';
}

function renderList(records) {
  const list = $('list');
  list.innerHTML = '';
  if (!records?.length) {
    list.innerHTML = '<div class="m" style="color:#666;padding:8px 0">暂无记录</div>';
    return;
  }
  for (const r of records.slice(0, 50)) {
    const el = document.createElement('div');
    el.className = 'item';

    const t = document.createElement('div');
    t.className = 't';
    t.textContent = r.title;

    const m = document.createElement('div');
    m.className = 'm';
    m.textContent = `${r.bvid} · ${r.owner} · ${r.subtitleAvailable ? '含字幕' : '无字幕'}`;

    el.append(t, m);
    // 点击条目:在 B 站标签页内弹出完整总结
    el.onclick = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && tab.url?.includes('bilibili.com')) {
        chrome.tabs.sendMessage(tab.id, { type: 'SHOW_SUMMARY', record: r });
      } else {
        setStatus(r.summary);
      }
    };
    list.appendChild(el);
  }
}

async function refresh() {
  const res = await send('GET_STATE');
  if (!res?.ok) return;
  const s = res.state;
  $('interval').value = s.intervalMinutes;
  $('llmBase').value = s.llmApiBase || '';
  $('llmKey').value = s.llmApiKey || '';
  $('llmModel').value = s.llmModel || 'gpt-4o-mini';
  setStatus(s.enabled ? `运行中 · ${s.lastStatus || ''}` : `已停止 · ${s.lastStatus || ''}`);
  renderList(s.records);
}

$('start').onclick = async () => {
  const intervalMinutes = Math.max(1, Number($('interval').value) || 10);
  const r = await send('START', { intervalMinutes });
  setStatus(r?.status ?? '已启动');
  refresh();
};

$('stop').onclick = async () => {
  const r = await send('STOP');
  setStatus(r?.status ?? '已停止');
  refresh();
};

$('tick').onclick = async () => {
  setStatus('正在抓取…');
  const r = await send('TICK_NOW');
  setStatus(r?.status ?? '完成');
  refresh();
};

$('clear').onclick = async () => {
  await send('CLEAR');
  refresh();
};

$('saveCfg').onclick = () => {
  chrome.storage.local.set(
    {
      llmApiBase: $('llmBase').value.trim(),
      llmApiKey: $('llmKey').value.trim(),
      llmModel: $('llmModel').value.trim() || 'gpt-4o-mini',
      intervalMinutes: Math.max(1, Number($('interval').value) || 10),
    },
    () => setStatus('设置已保存')
  );
};

refresh();
