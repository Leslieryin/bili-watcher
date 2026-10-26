// 端到端验证:带 Cookie + WBI 签名,字幕是否真能抓到。
// 这是 Node 引擎能否做"有内容"总结的关键验证。
import { loadEnv } from '../src/env.js';
import { fetchVideoDetail, fetchSubtitle, collectMaterial } from '../src/bili.js';

loadEnv(new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\'));

const cookie = process.env.BILI_COOKIE || '';
if (!cookie) {
  console.error('未读到 BILI_COOKIE');
  process.exit(1);
}
console.log(`Cookie 已加载,长度 ${cookie.length}\n`);

// 用一条已知有字幕的视频测试(上一条扩展产出过的)
const TEST_BVID = 'BV1Hrp46zEWf';

const detail = await fetchVideoDetail(TEST_BVID);
console.log(`标题: ${detail.title}`);
console.log(`UP主: ${detail.owner?.name}`);
console.log(`cid : ${detail.cid}`);

const sub = await fetchSubtitle(TEST_BVID, detail.cid, cookie);
if (sub) {
  console.log(`\n字幕语言: ${sub.lan}`);
  console.log(`字幕字数: ${sub.chars}`);
  console.log(`\n前 300 字:\n${sub.text.slice(0, 300)}`);
} else {
  console.log('\n未取到字幕(可能该视频确实无字幕,或接口返回空)');
}

console.log('\n--- 多视频抽样 ---');
const SAMPLES = ['BV1Hrp46zEWf', 'BV1Bjp966EA8', 'BV13KpX6bEBs', 'BV1yfpj6jEk5'];
let hit = 0;
for (const bv of SAMPLES) {
  try {
    const d = await fetchVideoDetail(bv);
    const s = await fetchSubtitle(bv, d.cid, cookie);
    if (s) {
      hit++;
      console.log(`有字幕 ${s.chars} 字 | ${bv} | ${d.title.slice(0, 30)}`);
    } else {
      console.log(`无字幕        | ${bv} | ${d.title.slice(0, 30)}`);
    }
  } catch (e) {
    console.log(`失败          | ${bv} | ${e.message}`);
  }
}
console.log(`\n命中 ${hit}/${SAMPLES.length}`);
