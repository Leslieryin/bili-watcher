// MD5 实现的自检:用 RFC 1321 标准测试向量验证,不通过则不能信任 wbi 签名。
import { md5 } from '../extension/lib/md5.js';

const VECTORS = [
  ['', 'd41d8cd98f00b204e9800998ecf8427e'],
  ['a', '0cc175b9c0f1b6a831c399e269772661'],
  ['abc', '900150983cd24fb0d6963f7d28e17f72'],
  ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
  ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
  [
    '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
    '57edf4a22be3c955ac49da2e2107b67a',
  ],
  // B 站场景常见:UTF-8 中文
  ['你好', '7eca689f0d3389d9dea66ae112e5cfd7'],
];

let pass = 0;
let fail = 0;
for (const [input, expect] of VECTORS) {
  const got = md5(input);
  const ok = got === expect;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} md5(${JSON.stringify(input).slice(0, 30)}) = ${got}${ok ? '' : ` (期望 ${expect})`}`);
}
console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
