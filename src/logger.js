// 会话日志:结构化落盘 + 控制台输出
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export class Logger {
  constructor(file) {
    this.file = file;
  }

  async log(level, msg, extra = {}) {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...extra,
    });
    const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const tag = { info: 'INFO', warn: 'WARN', error: 'ERR ' }[level] ?? 'INFO';
    console.log(`[${stamp}] ${tag} ${msg}`);
    await mkdir(dirname(this.file), { recursive: true });
    await appendFile(this.file, `${line}\n`, 'utf8');
  }

  info(m, e) {
    return this.log('info', m, e);
  }
  warn(m, e) {
    return this.log('warn', m, e);
  }
  error(m, e) {
    return this.log('error', m, e);
  }
}
