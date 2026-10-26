// 统一 HTTP 客户端:带 UA/Referer、超时、重试、限速。
// B 站公开接口对无 Referer 的裸请求会降级返回空数据,所以头必须带全。
import { setTimeout as sleep } from 'node:timers/promises';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const BASE_HEADERS = {
  'User-Agent': UA,
  Referer: 'https://www.bilibili.com/',
  Origin: 'https://www.bilibili.com',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

// 全局限速闸门:同一时刻只允许一个出站请求,请求间隔不低于 minGapMs。
let lastRequestAt = 0;
let gate = Promise.resolve();

export function createLimiter(minGapMs = 600) {
  return function limit(fn) {
    const run = gate.then(async () => {
      const wait = lastRequestAt + minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        return await fn();
      } finally {
        lastRequestAt = Date.now();
      }
    });
    // 吞掉 rejection 以免污染后续链,真实错误由 run 的调用方处理
    gate = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}

export async function getJson(url, { headers = {}, timeoutMs = 20000, retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { ...BASE_HEADERS, ...headers },
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      return json;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(500 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`请求失败 ${url} :: ${lastErr?.message ?? lastErr}`);
}

export async function getText(url, { headers = {}, timeoutMs = 20000, retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { ...BASE_HEADERS, ...headers },
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(500 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`请求失败 ${url} :: ${lastErr?.message ?? lastErr}`);
}
