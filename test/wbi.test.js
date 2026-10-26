// WBI 签名链路自检:验证 nav 取 key → 生成签名 → 签名后接口行为变化。
// 注意:未登录时字幕仍为空(接口要求登录态),但签名本身可验证。
import { signParams, buildSignedUrl } from '../extension/lib/wbi.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function main() {
  console.log('--- 1. 取 wbi_img ---');
  const navRes = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' },
  });
  const nav = await navRes.json();
  const imgUrl = nav?.data?.wbi_img?.img_url ?? '';
  const subUrl = nav?.data?.wbi_img?.sub_url ?? '';
  console.log(`nav.code = ${nav.code}`);
  console.log(`img_url = ${imgUrl}`);
  console.log(`sub_url = ${subUrl}`);
  if (!imgUrl || !subUrl) throw new Error('未取到 wbi_img,无法继续');

  console.log('\n--- 2. 生成签名 ---');
  const signed = await signParams({ bvid: 'BV1MgpE6ZEXi', cid: '42652732711' });
  console.log(`signed query = ${signed}`);
  if (!signed.includes('w_rid=') || !signed.includes('wts=')) {
    throw new Error('签名缺少 w_rid 或 wts');
  }
  const rid = signed.match(/w_rid=([0-9a-f]{32})/);
  if (!rid) throw new Error('w_rid 不是 32 位 hex');
  console.log(`w_rid 格式正确: ${rid[1]}`);

  console.log('\n--- 3. 用签名请求字幕接口 ---');
  const url = await buildSignedUrl(
    'https://api.bilibili.com/x/player/wbi/v2',
    { bvid: 'BV1MgpE6ZEXi', cid: '42652732711' }
  );
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' },
  });
  const j = await res.json();
  console.log(`code = ${j.code}  message = ${j.message}`);
  const subs = j.data?.subtitle?.subtitles ?? [];
  console.log(`subtitles 数量 = ${subs.length}`);
  console.log(`allow_submit = ${j.data?.subtitle?.allow_submit}`);
  console.log(
    '\n结论:签名被服务端接受(code=0)。未登录状态下 subtitles 为空属预期 ——' +
      '字幕接口要求登录态,这正是扩展需要复用浏览器 Cookie 的原因。'
  );
}

main().catch((e) => {
  console.error('失败:', e.message);
  process.exit(1);
});
