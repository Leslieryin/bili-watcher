// 扩展核心逻辑:随机取视频 → WBI 签名抓取元数据与字幕 → 生成总结。
// 关键点:带 Cookie 走签名接口才能拿到字幕,这是内容总结的质量分水岭。
import { buildSignedUrl } from './wbi.js';
import { summarize } from './summarize.js';

const UA_FALLBACK = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 在页面上下文里读取登录 Cookie(bili_jct 用于写操作鉴权)
export async function readCookie() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return '';
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.cookie,
    });
    return res?.[0]?.result ?? '';
  } catch {
    return '';
  }
}

async function fetchJson(url, cookie = '') {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'User-Agent': UA_FALLBACK,
      Referer: 'https://www.bilibili.com/',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchPopular(ps = 30, pn = 1) {
  const j = await fetchJson(`https://api.bilibili.com/x/web-interface/popular?ps=${ps}&pn=${pn}`);
  if (j.code !== 0) throw new Error(`popular code=${j.code} ${j.message}`);
  return j.data.list ?? [];
}

export async function fetchRanking(rid = 0) {
  const j = await fetchJson(`https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rid}&type=all`);
  if (j.code !== 0) return [];
  return j.data.list ?? [];
}

export async function fetchDetail(bvid, cookie = '') {
  const j = await fetchJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, cookie);
  if (j.code !== 0) throw new Error(`view code=${j.code} ${j.message}`);
  return j.data;
}

export async function fetchTags(bvid, cookie = '') {
  try {
    const j = await fetchJson(`https://api.bilibili.com/x/web-interface/view/detail?bvid=${bvid}`, cookie);
    return (j.data?.Tags ?? []).map((t) => t.tag_name);
  } catch {
    return [];
  }
}

// WBI 签名字幕接口 —— 未签名恒返回空 subtitles
export async function fetchSubtitle(bvid, cid, cookie = '') {
  try {
    const url = await buildSignedUrl(
      'https://api.bilibili.com/x/player/wbi/v2',
      { bvid, cid },
      cookie
    );
    const j = await fetchJson(url, cookie);
    const subs = j.data?.subtitle?.subtitles ?? [];
    if (!subs.length) return null;

    const pick = subs.find((s) => s.lan?.startsWith('zh')) ?? subs[0];
    const subUrl = pick.subtitle_url.startsWith('//')
      ? `https:${pick.subtitle_url}`
      : pick.subtitle_url;
    const raw = await fetchJson(subUrl, cookie);
    const text = (raw.body ?? []).map((b) => b.content).join('');
    return { lan: pick.lan, text, chars: text.length };
  } catch {
    return null;
  }
}

export function toMaterial(detail, tags) {
  const durationSec = detail.duration ?? 0;
  return {
    bvid: detail.bvid,
    aid: detail.aid,
    cid: detail.cid,
    title: detail.title,
    owner: detail.owner?.name ?? '',
    ownerMid: detail.owner?.mid,
    tname: detail.tname ?? '',
    desc: detail.desc ?? '',
    durationSec,
    durationText:
      durationSec >= 3600
        ? `${Math.floor(durationSec / 3600)}小时${Math.floor((durationSec % 3600) / 60)}分`
        : `${Math.floor(durationSec / 60)}分${durationSec % 60}秒`,
    tags,
    stat: {
      view: detail.stat?.view ?? 0,
      like: detail.stat?.like ?? 0,
      coin: detail.stat?.coin ?? 0,
      favorite: detail.stat?.favorite ?? 0,
      reply: detail.stat?.reply ?? 0,
      danmaku: detail.stat?.danmaku ?? 0,
    },
    url: `https://www.bilibili.com/video/${detail.bvid}`,
  };
}

// 完整流水线:候选 → 随机抽取未看过 → 抓取 → 总结
// 实测:ranking 接口匿名调用恒返回 -352(风控),故候选池以 popular 翻页为主。
export async function watchOne({ store, cookie = '', llm = null, pools = 30, pages = 4 } = {}) {
  const merged = new Map();

  for (let pn = 1; pn <= pages; pn++) {
    try {
      const list = await fetchPopular(pools, pn);
      for (const v of list) if (v?.bvid) merged.set(v.bvid, v);
      if (list.length < pools) break;
    } catch {
      // 单页失败跳过,不影响整体候选池
    }
  }

  // 排行榜仅作可选补充,失败即忽略
  const [r1, r2] = await Promise.allSettled([fetchRanking(0), fetchRanking(1005)]);
  for (const p of [r1, r2]) {
    if (p.status === 'fulfilled') for (const v of p.value) if (v?.bvid) merged.set(v.bvid, v);
  }

  const all = [...merged.values()];
  const fresh = all.filter((v) => !store.has(v.bvid));
  if (!fresh.length) return { skipped: true, reason: '候选池已全部看过', poolSize: all.length };

  const video = fresh[Math.floor(Math.random() * fresh.length)];
  const detail = await fetchDetail(video.bvid, cookie);
  const tags = await fetchTags(video.bvid, cookie);
  const m = toMaterial(detail, tags);

  let subtitle = null;
  if (cookie && m.cid) subtitle = await fetchSubtitle(m.bvid, m.cid, cookie);

  const summary = await summarize(m, subtitle?.text ?? '', llm);

  const record = {
    ...m,
    summary,
    subtitleAvailable: Boolean(subtitle),
    subtitleChars: subtitle?.chars ?? 0,
    watchedAt: new Date().toISOString(),
  };
  await store.add(record);
  return { skipped: false, record, poolSize: all.length };
}
