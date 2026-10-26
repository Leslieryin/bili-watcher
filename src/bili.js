// B 站公开数据抓取层。
// 实测(2026-10):未登录状态下 player/wbi/v2 的 subtitles 恒为空数组,
// 因此内容源以 view + view/detail 的元数据为准,字幕作为可选增强。
import { getJson, createLimiter } from './http.js';
import { buildSignedUrl } from './wbi.js';

const limit = createLimiter(700);

export async function fetchPopular({ ps = 20, pn = 1 } = {}) {
  const url = `https://api.bilibili.com/x/web-interface/popular?ps=${ps}&pn=${pn}`;
  return limit(async () => {
    const j = await getJson(url);
    if (j.code !== 0) throw new Error(`popular 接口错误 code=${j.code} msg=${j.message}`);
    return j.data.list ?? [];
  });
}

// 排行榜:按分区取。
// 实测(2026-10):rid=0/1/4/1005 全部返回 code=-352(风控拦截),
// 该接口需要 w_rid 签名或登录态,匿名调用不可用。保留函数但明确区分风控与网络错误。
export async function fetchRanking({ rid = 0, ps = 20 } = {}) {
  const url = `https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rid}&type=all`;
  return limit(async () => {
    const j = await getJson(url);
    if (j.code === -352) {
      throw new Error(`ranking 接口被风控拦截(code=-352),该接口匿名不可用`);
    }
    if (j.code !== 0) throw new Error(`ranking 接口错误 code=${j.code} msg=${j.message}`);
    return (j.data.list ?? []).slice(0, ps);
  });
}

// 热门池翻页:这是匿名状态下唯一稳定可用的候选来源。
// 实测 popular 接口 pn=1..N 均正常返回,故用它撑起候选池规模。
export async function fetchPopularPages({ pages = 5, ps = 20 } = {}) {
  const results = [];
  for (let pn = 1; pn <= pages; pn++) {
    try {
      const list = await fetchPopular({ ps, pn });
      results.push(...list);
      if (list.length < ps) break; // 已到末页
    } catch (err) {
      // 单页失败不影响整体,记录后继续
      results.push({ __error: String(err.message ?? err), __page: pn });
    }
  }
  return results.filter((v) => v && !v.__error);
}

export async function fetchVideoDetail(bvid) {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  return limit(async () => {
    const j = await getJson(url);
    if (j.code !== 0) throw new Error(`view 接口错误 code=${j.code} msg=${j.message}`);
    return j.data;
  });
}

export async function fetchTagsAndRelated(bvid) {
  const url = `https://api.bilibili.com/x/web-interface/view/detail?bvid=${bvid}`;
  return limit(async () => {
    const j = await getJson(url);
    if (j.code !== 0) return { tags: [], related: [] };
    const tags = (j.data?.Tags ?? []).map((t) => t.tag_name);
    const related = (j.data?.Related ?? []).slice(0, 5).map((r) => ({
      bvid: r.bvid,
      title: r.title,
      owner: r.owner?.name,
    }));
    return { tags, related };
  });
}

// 字幕:必须带 WBI 签名 + 登录 Cookie,否则恒返回空数组。
// 这是内容总结质量的分水岭 —— 有字幕才能拿到视频实际讲了什么。
export async function fetchSubtitle(bvid, cid, cookie = '') {
  if (!cookie) return null;
  const url = await buildSignedUrl(
    'https://api.bilibili.com/x/player/wbi/v2',
    { bvid, cid },
    cookie
  );
  return limit(async () => {
    try {
      const j = await getJson(url, { headers: { Cookie: cookie } });
      if (j.code !== 0) return null;
      const subs = j.data?.subtitle?.subtitles ?? [];
      if (!subs.length) return null;

      // 优先中文,其次第一条
      const pick = subs.find((s) => s.lan?.startsWith('zh')) ?? subs[0];
      const raw = await getJson(
        pick.subtitle_url.startsWith('//') ? `https:${pick.subtitle_url}` : pick.subtitle_url,
        { headers: { Cookie: cookie } }
      );
      const text = (raw.body ?? []).map((b) => b.content).join('');
      return { lan: pick.lan, text, chars: text.length };
    } catch {
      return null;
    }
  });
}

// 把多源元数据拼成一份"可总结"的资料包
export async function collectMaterial(video) {
  const bvid = video.bvid;
  const detail = await fetchVideoDetail(bvid);
  const { tags, related } = await fetchTagsAndRelated(bvid);
  const durationSec = detail.duration ?? 0;
  return {
    bvid,
    aid: detail.aid,
    cid: detail.cid,
    title: detail.title,
    owner: detail.owner?.name,
    ownerMid: detail.owner?.mid,
    tname: detail.tname,
    desc: detail.desc ?? '',
    dynamic: detail.dynamic ?? '',
    durationText:
      durationSec >= 3600
        ? `${Math.floor(durationSec / 3600)}小时${Math.floor((durationSec % 3600) / 60)}分`
        : `${Math.floor(durationSec / 60)}分${durationSec % 60}秒`,
    durationSec,
    tags,
    related,
    stat: {
      view: detail.stat?.view ?? 0,
      like: detail.stat?.like ?? 0,
      coin: detail.stat?.coin ?? 0,
      favorite: detail.stat?.favorite ?? 0,
      reply: detail.stat?.reply ?? 0,
      danmaku: detail.stat?.danmaku ?? 0,
    },
    pubdate: detail.pubdate,
    url: `https://www.bilibili.com/video/${bvid}`,
    collectedAt: new Date().toISOString(),
  };
}
