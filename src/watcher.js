// 主循环:随机挑选未看过的视频 → 抓取资料 → 生成总结 → 落盘。
// 支持一次性运行(--once)与常驻守护(--daemon)。
import { randomInt } from 'node:crypto';
import { fetchPopularPages, fetchRanking, collectMaterial, fetchSubtitle } from './bili.js';
import { summarize } from './summarize.js';
import { Store } from './store.js';
import { Logger } from './logger.js';
import { appendFile, mkdir } from 'node:fs/promises';

const HOME_OWNER = { name: '铃芽之鱼', uid: '649222348' };

function pickRandom(arr, n) {
  const pool = [...arr];
  const out = [];
  while (pool.length && out.length < n) {
    out.push(pool.splice(randomInt(pool.length), 1)[0]);
  }
  return out;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Watcher {
  constructor({ storeFile, logFile, digestFile, cookie = '' } = {}) {
    this.store = new Store(storeFile);
    this.logger = new Logger(logFile);
    this.digestFile = digestFile;
    this.cookie = cookie;
    this.running = false;
  }

  async init() {
    await this.store.load();
    return this;
  }

  // 构建候选池。
  // 实测:ranking 接口匿名调用恒返回 -352(风控),不可依赖;
  // 因此以 popular 多页翻页为主力来源,ranking 仅作可选补充。
  async buildPool(perSource = 20) {
    const merged = new Map();

    // 主力:热门池翻 6 页,约 120 条
    const popularList = await fetchPopularPages({ pages: 6, ps: perSource });
    for (const v of popularList) if (v?.bvid) merged.set(v.bvid, v);

    // 补充:排行榜(预期失败,失败即忽略,不影响候选池)
    const rankingPools = await Promise.allSettled([
      fetchRanking({ rid: 0, ps: perSource }),
      fetchRanking({ rid: 1005, ps: perSource }),
    ]);
    for (const p of rankingPools) {
      if (p.status === 'fulfilled') {
        for (const v of p.value) if (v?.bvid) merged.set(v.bvid, v);
      }
    }

    return shuffle([...merged.values()]);
  }

  // 处理单个视频,返回记录或 null
  async processVideo(video) {
    const m = await collectMaterial(video);

    let subtitleText = '';
    if (this.cookie && m.cid) {
      const sub = await fetchSubtitle(m.bvid, m.cid, this.cookie);
      if (sub) subtitleText = sub.text;
    }

    const summary = await summarize(m, subtitleText);

    const record = {
      ...m,
      summary,
      subtitleAvailable: Boolean(subtitleText),
      subtitleChars: subtitleText.length,
      forOwner: HOME_OWNER,
    };

    await this.store.add(record);
    await this.appendDigest(record);
    await this.logger.info(`已总结: ${m.title}`, { bvid: m.bvid, owner: m.owner });
    return record;
  }

  async appendDigest(record) {
    const block = [
      '='.repeat(72),
      `@${HOME_OWNER.name} 视频总结 · ${record.bvid}`,
      `标题: ${record.title}`,
      `UP主: ${record.owner} | 分区: ${record.tname} | 时长: ${record.durationText}`,
      `字幕: ${record.subtitleAvailable ? `有(${record.subtitleChars} 字)` : '无'}`,
      `链接: ${record.url}`,
      '-'.repeat(72),
      record.summary,
      '',
    ].join('\n');
    await mkdir('logs', { recursive: true });
    await appendFile(this.digestFile, `${block}\n`, 'utf8');
  }

  async runOnce(count = 3) {
    const pool = await this.buildPool();
    const fresh = pool.filter((v) => !this.store.has(v.bvid));
    await this.logger.info(`候选 ${pool.length} 条,未看过 ${fresh.length} 条,本次处理 ${Math.min(count, fresh.length)} 条`);
    if (!fresh.length) {
      await this.logger.warn('候选池已全部看过,建议稍后再跑或扩大候选源');
      return [];
    }
    const targets = pickRandom(fresh, count);
    const results = [];
    for (const v of targets) {
      try {
        results.push(await this.processVideo(v));
      } catch (err) {
        await this.logger.error(`处理失败 ${v.bvid}`, { error: String(err.message ?? err) });
      }
    }
    return results;
  }

  async runDaemon({ intervalMs = 10 * 60 * 1000, batch = 2 } = {}) {
    this.running = true;
    await this.logger.info(`守护模式启动,间隔 ${Math.round(intervalMs / 1000)}s,每轮 ${batch} 条`);
    while (this.running) {
      try {
        await this.runOnce(batch);
      } catch (err) {
        await this.logger.error('本轮异常', { error: String(err.message ?? err) });
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  stop() {
    this.running = false;
  }
}
