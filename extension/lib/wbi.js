// B 站 WBI 签名。
// 未签名的 wbi 接口(如 x/player/wbi/v2)会返回空数据,这是拿不到字幕的直接原因。
// 算法:nav 接口取 img_key/sub_key → 拼接重排得 mixin_key →
//       参数按 key 排序 + 过滤 !'()* + urlencode + wts + md5(query+mixin_key)。
import { md5 } from './md5.js';

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];

let cache = { mixinKey: '', fetchedAt: 0 };

function getMixinKey(imgKey, subKey) {
  const orig = imgKey + subKey;
  let out = '';
  for (let i = 0; i < 32; i++) out += orig[MIXIN_KEY_ENC_TAB[i]];
  return out;
}

// 从 nav 接口获取并缓存 mixin_key(有效期按 12 小时保守处理)
async function fetchMixinKey(cookie = '') {
  const now = Date.now();
  if (cache.mixinKey && now - cache.fetchedAt < 12 * 3600 * 1000) return cache.mixinKey;

  const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    credentials: 'include',
    headers: cookie ? { Cookie: cookie } : {},
  });
  const j = await res.json();
  const imgUrl = j?.data?.wbi_img?.img_url ?? '';
  const subUrl = j?.data?.wbi_img?.sub_url ?? '';
  const pick = (u) => u.slice(u.lastIndexOf('/') + 1).split('.')[0];
  const imgKey = pick(imgUrl);
  const subKey = pick(subUrl);
  if (!imgKey || !subKey) throw new Error('无法获取 wbi_img,可能是接口风控或未登录');

  cache = { mixinKey: getMixinKey(imgKey, subKey), fetchedAt: now };
  return cache.mixinKey;
}

// 对参数对象签名,返回带 w_rid/wts 的完整查询串
export async function signParams(params, cookie = '') {
  const mixinKey = await fetchMixinKey(cookie);
  const wts = Math.round(Date.now() / 1000);
  const all = { ...params, wts };

  const sorted = Object.keys(all)
    .sort()
    .map((k) => {
      const v = String(all[k]).replace(/[!'()*]/g, '');
      return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
    })
    .join('&');

  const wRid = md5(sorted + mixinKey);
  return `${sorted}&w_rid=${wRid}`;
}

// 构造已签名的完整 URL
export async function buildSignedUrl(base, params, cookie = '') {
  const query = await signParams(params, cookie);
  return `${base}?${query}`;
}
