// 扫描 Chrome 扩展存储(LevelDB),定位 bili-watcher 的配置并提取 LLM 设置。
// 输出时对密钥做掩码,避免完整凭证进入终端记录。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASE = join(
  process.env.LOCALAPPDATA,
  'Google', 'Chrome', 'User Data', 'Default', 'Local Extension Settings'
);

const DIRS = readdirSync(BASE).filter((d) => statSync(join(BASE, d)).isDirectory());

function scanDir(dir) {
  const full = join(BASE, dir);
  const files = readdirSync(full).filter((f) => /\.(log|ldb)$/.test(f));
  let haystack = '';
  for (const f of files) {
    try {
      haystack += readFileSync(join(full, f)).toString('latin1');
    } catch {
      /* 跳过无法读取的文件 */
    }
  }
  return haystack;
}

const mask = (s) => (s && s.length > 10 ? `${s.slice(0, 6)}...${s.slice(-4)}(${s.length}字符)` : '(空)');

for (const dir of DIRS) {
  const hay = scanDir(dir);
  // 判断是否为本扩展:存储里有 records / intervalMinutes / llmApiBase 等键
  const isOurs = /llmApiBase|intervalMinutes|subtitleAvailable/.test(hay);
  console.log(`\n=== ${dir} ${isOurs ? '[疑似本扩展]' : ''} ===`);
  console.log(`扫描字节数: ${hay.length}`);

  if (!isOurs) continue;

  const grab = (key) => {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
    const m = hay.match(re);
    return m ? m[1] : null;
  };

  const apiBase = grab('llmApiBase');
  const apiKey = grab('llmApiKey');
  const model = grab('llmModel');

  console.log(`llmApiBase = ${apiBase ?? '(未找到)'}`);
  console.log(`llmApiKey  = ${mask(apiKey)}`);
  console.log(`llmModel   = ${model ?? '(未找到)'}`);

  // 顺带确认 Cookie 复用相关设置
  const useCookie = grab('useCookie');
  if (useCookie !== null) console.log(`useCookie  = ${useCookie}`);
}
