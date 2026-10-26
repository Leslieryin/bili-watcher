#!/usr/bin/env node
// CLI 入口:bili-watcher
//   一次性:  node src/index.js once --count 3
//   常驻:    node src/index.js daemon --interval 600 --batch 2
//   看状态:  node src/index.js status
import { Watcher } from './watcher.js';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadEnv } from './env.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// 先加载 .env,再读取依赖环境变量的配置
loadEnv(`${ROOT}.env`.replace(/\\/g, '/'));

const STORE_FILE = process.env.STORE_FILE || `${ROOT}data/seen.json`.replace(/\\/g, '/');
const LOG_FILE = process.env.LOG_FILE || `${ROOT}logs/session.log`.replace(/\\/g, '/');
const DIGEST_FILE = process.env.DIGEST_FILE || `${ROOT}logs/digest.md`.replace(/\\/g, '/');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'once';

  const watcher = await new Watcher({
    storeFile: STORE_FILE,
    logFile: LOG_FILE,
    digestFile: DIGEST_FILE,
    cookie: process.env.BILI_COOKIE || '',
  }).init();

  if (cmd === 'status') {
    console.log(`已总结视频数: ${watcher.store.size}`);
    console.log(`存储文件: ${STORE_FILE}`);
    console.log(`摘要文件: ${DIGEST_FILE}`);
    if (existsSync(DIGEST_FILE)) {
      const raw = await readFile(DIGEST_FILE, 'utf8');
      const tail = raw.trim().split('\n').slice(-24).join('\n');
      console.log('\n--- 最近摘要 ---\n' + tail);
    }
    return;
  }

  if (cmd === 'once') {
    const count = Number(args.count || 3);
    const results = await watcher.runOnce(count);
    console.log(`\n完成,本次产出 ${results.length} 条总结。`);
    return;
  }

  if (cmd === 'daemon') {
    const intervalMs = Number(args.interval || 600) * 1000;
    const batch = Number(args.batch || 2);
    process.on('SIGINT', () => {
      watcher.stop();
      console.log('\n收到中断,正在退出…');
    });
    await watcher.runDaemon({ intervalMs, batch });
    return;
  }

  console.log(`未知命令: ${cmd}\n用法: node src/index.js [once|daemon|status] [--count N] [--interval S] [--batch N]`);
}

main().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
