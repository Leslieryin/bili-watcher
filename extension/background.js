// 后台服务:定时随机刷视频、生成总结、持久化。
// 使用 chrome.alarms 而非 setInterval —— MV3 service worker 会被回收,
// 只有 alarms 能在 worker 重启后继续驱动定时任务。
import { watchOne, readCookie } from './lib/watcher.js';

const ALARM_NAME = 'bili-watch-tick';
const DEFAULTS = {
  enabled: false,
  intervalMinutes: 10,
  useCookie: true,
  llmApiBase: '',
  llmApiKey: '',
  llmModel: 'gpt-4o-mini',
  records: [],
};

async function getState() {
  const s = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...s };
}

async function pushRecord(record) {
  const { records } = await await getState();
  records.unshift(record);
  // 只保留最近 300 条,避免存储无限膨胀
  await chrome.storage.local.set({ records: records.slice(0, 300) });
}

async function tick() {
  const state = await getState();
  if (!state.enabled) return;

  await chrome.storage.local.set({ lastStatus: '运行中…' });
  try {
    const cookie = state.useCookie ? await readCookie() : '';
    const llm = state.llmApiBase
      ? { apiBase: state.llmApiBase, apiKey: state.llmApiKey, model: state.llmModel }
      : null;

    // 复用 Node 版的去重语义:用 storage 里的 bvid 集合
    const store = {
      has: (bvid) => state.records.some((r) => r.bvid === bvid),
      add: pushRecord,
    };

    const res = await watchOne({ store, cookie, llm });
    if (res.skipped) {
      await chrome.storage.local.set({ lastStatus: `跳过:${res.reason}(候选 ${res.poolSize})` });
      return;
    }
    await chrome.storage.local.set({
      lastStatus: `已总结《${res.record.title}》${res.subtitleAvailable ? ' [含字幕]' : ''}`,
      lastRecord: res.record,
    });
    updateBadge(state.records.length + 1);
  } catch (err) {
    await chrome.storage.local.set({ lastStatus: `失败:${err.message}` });
  }
}

function updateBadge(count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count > 99 ? '99+' : count) });
    chrome.action.setBadgeBackgroundColor({ color: '#00a1d6' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

async function ensureAlarm() {
  const state = await getState();
  await chrome.alarms.clear(ALARM_NAME);
  if (state.enabled) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: state.intervalMinutes });
  }
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM_NAME) tick();
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set(DEFAULTS);
  const { records } = await getState();
  updateBadge(records.length);
});

chrome.runtime.onStartup.addListener(ensureAlarm);

// popup 发来的控制指令
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case 'START': {
        await chrome.storage.local.set({
          enabled: true,
          intervalMinutes: msg.intervalMinutes ?? 10,
        });
        await ensureAlarm();
        sendResponse({ ok: true, status: '已启动' });
        break;
      }
      case 'STOP': {
        await chrome.storage.local.set({ enabled: false });
        await ensureAlarm();
        sendResponse({ ok: true, status: '已停止' });
        break;
      }
      case 'TICK_NOW': {
        await tick();
        const s = await getState();
        sendResponse({ ok: true, status: s.lastStatus });
        break;
      }
      case 'CLEAR': {
        await chrome.storage.local.set({ records: [], lastStatus: '', lastRecord: null });
        updateBadge(0);
        sendResponse({ ok: true });
        break;
      }
      case 'GET_STATE': {
        const s = await getState();
        sendResponse({ ok: true, state: s });
        break;
      }
      default:
        sendResponse({ ok: false, error: 'unknown message' });
    }
  })();
  return true; // 保持消息通道开启以支持异步响应
});
