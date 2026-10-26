// 去重存储:记录已处理过的 bvid,避免重复刷同一个视频。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export class Store {
  constructor(file) {
    this.file = file;
    this.seen = new Set();
    this.records = [];
  }

  async load() {
    try {
      const raw = await readFile(this.file, 'utf8');
      const data = JSON.parse(raw);
      this.records = data.records ?? [];
      this.seen = new Set(this.records.map((r) => r.bvid));
    } catch {
      this.records = [];
      this.seen = new Set();
    }
    return this;
  }

  has(bvid) {
    return this.seen.has(bvid);
  }

  async add(record) {
    this.seen.add(record.bvid);
    this.records.push(record);
    await this.save();
  }

  async save() {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify({ records: this.records }, null, 2), 'utf8');
  }

  get size() {
    return this.records.length;
  }
}
