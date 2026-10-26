// 扩展侧产出的记录导出为 Markdown,便于与 Node 版产出合并查看。
// 用法: node test/export-ext.mjs
// 说明:扩展把记录存在 chrome.storage.local,命令行读不到;
//       此脚本用于把你在 popup 里点开的记录手动贴进来后统一格式化。
import { readFile, writeFile } from 'node:fs/promises';

const IN = process.argv[2] || 'data/ext-records.json';
const OUT = process.argv[3] || 'logs/ext-digest.md';

try {
  const raw = await readFile(IN, 'utf8');
  const records = JSON.parse(raw);
  const blocks = records.map((r) =>
    [
      '='.repeat(72),
      `@铃芽之鱼 视频总结 · ${r.bvid}`,
      `标题: ${r.title}`,
      `UP主: ${r.owner} | 时长: ${r.durationText || '-'}`,
      `链接: ${r.url || `https://www.bilibili.com/video/${r.bvid}`}`,
      `字幕: ${r.subtitleAvailable ? `有(${r.subtitleChars} 字)` : '无'}`,
      '-'.repeat(72),
      r.summary,
      '',
    ].join('\n')
  );
  await writeFile(OUT, blocks.join('\n'), 'utf8');
  console.log(`已导出 ${records.length} 条到 ${OUT}`);
} catch (err) {
  console.error(`读取失败: ${err.message}`);
  console.error(`请先把扩展记录保存为 ${IN}(JSON 数组格式)`);
  process.exit(1);
}
