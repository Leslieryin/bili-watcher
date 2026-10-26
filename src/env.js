// 极简 .env 加载器(避免引入 dotenv 依赖)。
// 只解析 KEY=VALUE,忽略注释与空行,不覆盖已存在的环境变量。
import { readFileSync } from 'node:fs';

export function loadEnv(file = '.env') {
  try {
    const raw = readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      // 去掉包裹的引号
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
    return true;
  } catch {
    return false;
  }
}
