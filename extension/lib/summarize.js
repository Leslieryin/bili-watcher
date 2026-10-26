// 总结层(扩展版,与 Node 版逻辑一致但无外部依赖)。
const NUM = (n) => {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return String(n);
};

const HOT = (s) => {
  const score = s.view + s.like * 20 + s.coin * 40 + s.favorite * 30;
  if (score > 2e6) return '热度很高';
  if (score > 5e5) return '热度不错';
  return '热度一般';
};

export function summarizeOffline(m, subtitleText = '') {
  const lines = [];
  lines.push(`【${m.title}】`);
  lines.push(
    `${m.durationText} · ${m.tname || '未分类'} · UP主「${m.owner}」。看的人${HOT(m.stat)}:` +
      `播放 ${NUM(m.stat.view)}、点赞 ${NUM(m.stat.like)}、投币 ${NUM(m.stat.coin)}、` +
      `收藏 ${NUM(m.stat.favorite)}、评论 ${NUM(m.stat.reply)}。`
  );

  if (subtitleText) {
    // 有字幕时以字幕为准,截取关键片段
    const clean = subtitleText.replace(/\s+/g, ' ').trim();
    const brief = clean.length > 400 ? `${clean.slice(0, 400)}…` : clean;
    lines.push(`内容(据字幕):${brief}`);
  } else {
    if (m.tags?.length) lines.push(`主题标签:${m.tags.slice(0, 8).join(' / ')}。`);
    const d = (m.desc || '').trim();
    if (d) {
      lines.push(`简介要点:${d.length > 160 ? `${d.slice(0, 160)}…` : d}`);
    } else {
      lines.push('该视频未填写简介,内容线索来自标题与标签。');
    }
  }

  lines.push(`原视频:${m.url}`);
  return lines.join('\n');
}

// 有 LLM 配置时走模型生成,否则回退离线模板
export async function summarize(m, subtitleText, llm = null) {
  if (llm?.apiBase && llm?.apiKey) {
    const viaLLM = await callLLM(m, subtitleText, llm);
    if (viaLLM) return viaLLM;
  }
  return summarizeOffline(m, subtitleText);
}

async function callLLM(m, subtitleText, { apiBase, apiKey, model = 'gpt-4o-mini' }) {
  const material = [
    `标题:${m.title}`,
    `UP主:${m.owner}`,
    `分区:${m.tname}`,
    `时长:${m.durationText}`,
    `标签:${(m.tags ?? []).join('、')}`,
    `简介:${m.desc || '(无)'}`,
    subtitleText ? `字幕节选:${subtitleText.slice(0, 6000)}` : '字幕:(不可得)',
  ].join('\n');

  const prompt =
    '你在替人总结一条 B 站视频。只依据给定资料,不要编造情节。' +
    '输出 3-5 句中文总结:第一句点明主题,中间给关键信息与看点,最后一句给客观评价。\n\n' +
    material;

  try {
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}
