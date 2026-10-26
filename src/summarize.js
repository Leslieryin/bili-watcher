// 总结层:把资料包压成一段人话。
// 默认走离线模板归纳(不依赖任何外部 LLM),若配置了 LLM_API 则走模型生成。
// 字幕可用时以字幕为内容主源 —— 这是"总结"与"复述简介"的区别所在。

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

// 跨全文均匀采样字幕。
// 不能只截开头:视频开头常是片头曲、口播广告或"大家好我是xxx"这类无信息量内容。
// 做法是跳过前 12%(通常是片头/广告位),再在剩余部分均匀取 n 段。
function sampleSubtitle(text, budget = 480, segments = 4) {
  const t = (text || '').replace(/\s+/g, '').trim();
  if (!t) return '';
  if (t.length <= budget) return t;

  const headSkip = Math.floor(t.length * 0.12);
  const usable = t.slice(headSkip);
  if (usable.length <= budget) return usable;

  const per = Math.floor(budget / segments);
  const step = Math.floor(usable.length / segments);
  const parts = [];
  for (let i = 0; i < segments; i++) {
    const start = i * step;
    const chunk = usable.slice(start, start + per).trim();
    if (chunk) parts.push(chunk);
  }
  return parts.join(' … ');
}

// 离线模板归纳:无 LLM 时的兜底。
// 有字幕则以字幕为内容主源,无字幕才退回元数据拼接。
export function summarizeOffline(m, subtitleText = '') {
  const lines = [];
  lines.push(`《${m.title}》`);
  lines.push(
    `这是一条 ${m.durationText} 的${m.tname || '未分类'}视频,UP主「${m.owner}」。` +
      `看的人${HOT(m.stat)}:播放 ${NUM(m.stat.view)}、点赞 ${NUM(m.stat.like)}、` +
      `投币 ${NUM(m.stat.coin)}、收藏 ${NUM(m.stat.favorite)}、评论 ${NUM(m.stat.reply)}。`
  );

  const sub = (subtitleText || '').replace(/\s+/g, '').trim();
  if (sub) {
    lines.push(`内容(据 ${sub.length} 字字幕,跨时长采样):${sampleSubtitle(sub, 480)}`);
    lines.push(`字幕全文 ${sub.length} 字已存入记录,可另行细读。`);
  } else {
    lines.push('未取到字幕,以下线索来自标题与元数据。');
    if (m.tags.length) {
      lines.push(`主题标签:${m.tags.slice(0, 8).join(' / ')}。`);
    }
    const d = (m.desc || '').trim();
    if (d) {
      const brief = d.length > 160 ? `${d.slice(0, 160)}…` : d;
      lines.push(`简介要点:${brief.replace(/\s+/g, ' ')}`);
    } else {
      lines.push('该视频未填写简介,内容线索主要来自标题与标签。');
    }
    const dyn = (m.dynamic || '').trim();
    if (dyn) lines.push(`UP主动态补充:${dyn.slice(0, 120)}`);
  }

  if (m.related.length) {
    lines.push(`相关联视频:${m.related.map((r) => `《${r.title}》`).join('、')}。`);
  }
  lines.push(`原视频:${m.url}`);
  return lines.join('\n');
}

// 可选:走 OpenAI 兼容接口做真实内容总结(需配置环境变量)
export async function summarizeWithLLM(m, subtitleText = '') {
  const apiBase = process.env.LLM_API_BASE;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  if (!apiBase || !apiKey) return null;

  const material = [
    `标题:${m.title}`,
    `UP主:${m.owner}`,
    `分区:${m.tname}`,
    `时长:${m.durationText}`,
    `标签:${m.tags.join('、')}`,
    `简介:${m.desc || '(无)'}`,
    subtitleText ? `字幕节选:${subtitleText.slice(0, 6000)}` : '字幕:(不可得)',
  ].join('\n');

  const prompt =
    '你在替人总结一条 B 站视频。只依据给定资料,不要编造情节。' +
    '输出 3-5 句中文总结,第一句点明主题,之后给关键信息与看点,最后一句给一句客观评价。\n\n' +
    material;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 60000);
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
      }),
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function summarize(m, subtitleText = '') {
  const viaLLM = await summarizeWithLLM(m, subtitleText);
  return viaLLM ?? summarizeOffline(m, subtitleText);
}
