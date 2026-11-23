const HEAD = '[OOC · LOVE COLOR 색 견본집] 잠시 역할극 중단. NPC/PC 기존설정, 관계성, 성격, 성향, 말투, 서사, 캐릭터정보, 유저노트, 로어북 종합참고. 두 사람 모두 성인이다.';
const OUT = '[출력] 역할극 서술 없이 코드블록 하나에 아래 형식 그대로 한 항목 한 줄씩 쓴다. 표로 만들지 않는다. 줄 앞의 NPC, PC 글자는 바꾸지 않는다. PC의 대사와 감정은 지어내지 않는다.';

export function buildPrompt() {
  return `${HEAD}
두 사람의 색 견본집을 만든다. 각자를 상징하는 색(상징색) 하나, 각자가 상대를 사랑하는 방식의 색(사랑색) 하나, 모두 네 가지 색을 고르고 두 사랑색이 섞인 혼합색을 판독한다.

[색 규칙]
- 상징색: 그 사람의 성격, 분위기, 살아온 서사를 담은 색.
- 사랑색: 그 사람이 상대를 사랑하는 방식의 색. 같은 사람의 상징색과 다른 색으로 고른다.
- 색 코드는 #RRGGBB. 순수 원색과 완전한 흰색·검은색은 피하고, 그 사람에게만 맞는 미묘한 색을 고른다. 네 색은 색상이나 밝기가 서로 뚜렷이 다르게 한다.
- PC의 두 색은 PC가 서사에서 실제로 한 말과 행동만 근거로 삼는다.

[이름·문장 규칙]
- 색 이름: 한글 2~8자로 직접 짓는다. 쪽빛, 치자빛, 도홧빛처럼 자연과 사물에서 온 이름. 영문 이름 2~3단어를 괄호로 붙인다.
- 이유: 서사 속 실제 장면과 행동을 근거로 1~2문장, 60자 이내. 과장하지 않는 담담한 서술체로 '~다.'로 끝낸다.
- 키워드: 그 사람을 나타내는 2~4자 명사 3개.
- 질감: 그 사람 사랑색의 표면. 매트(드러내지 않음), 글로스(숨기지 않음), 펄(볼 때마다 다름), 벨벳(안으로 삼킴), 시어(속이 비침), 메탈릭(차갑지만 단단함) 중 하나와 근거 1문장 30자 이내.
- 혼합 비율: 두 사랑색을 섞을 때 각자의 양. 정수로 합 100. 지금 더 깊이 마음을 쓰는 쪽이 크다. 근거 1문장 30자 이내.
- 혼합색: 색 코드는 쓰지 않는다. 이름은 색 이름 규칙을 따르고, 설명은 두 사랑이 어떻게 섞였는지 2문장, 100자 이내.
- 한 줄: 결과 첫 화면에 놓일 문장. 이름 없이 30자 이내.
- 글자 수 제한을 넘기지 않는다. 서사에 없던 사건을 지어내지 않는다.

${OUT}
대상: NPC 이름 / PC 이름
NPC 상징색: #RRGGBB · 색 이름 (English Name) · 이유
PC 상징색: #RRGGBB · 색 이름 (English Name) · 이유
NPC 사랑색: #RRGGBB · 색 이름 (English Name) · 이유
PC 사랑색: #RRGGBB · 색 이름 (English Name) · 이유
NPC 키워드: 명사, 명사, 명사
PC 키워드: 명사, 명사, 명사
NPC 질감: 질감 하나 · 근거
PC 질감: 질감 하나 · 근거
혼합 비율: NPC 00 : PC 00 · 근거
혼합색 이름: 색 이름 (English Name)
혼합색 설명: ~
한 줄: ~`;
}

const KEY_RE = /^(.*?)(대상|상징\s*색(?:상)?|사랑\s*색(?:상)?|키워드|질감|혼합\s*비율|혼합\s*색\s*이름|혼합\s*색\s*설명|혼합\s*색|한\s*줄(?:\s*카피)?)\s*[:：]\s*(.*)$/;
const SEP = /\s*[·•∙|]\s*|\s+[-–—]\s+/;
const FINISH = [
  ['matte', /매트|무광|matte/i, '매트'],
  ['gloss', /글로스|유광|광택|gloss/i, '글로스'],
  ['pearl', /펄|진주|pearl/i, '펄'],
  ['velvet', /벨벳|velvet/i, '벨벳'],
  ['sheer', /시어|투명|반투명|sheer/i, '시어'],
  ['metal', /메탈|금속|metal/i, '메탈릭'],
];

export const LIMITS = { why: 70, finishWhy: 40, ratioWhy: 40, desc: 110, line: 40, name: 20, colorName: 20, en: 32, kw: 8 };

export function clip(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if ([...t].length <= max) return t;
  const head = [...t].slice(0, max).join('');
  const stop = Math.max(head.lastIndexOf('다.'), head.lastIndexOf('. '), head.lastIndexOf('.'));
  if (stop >= max * 0.5) return head.slice(0, head[stop] === '다' ? stop + 2 : stop + 1).trim();
  return head.replace(/[\s,·.]+$/, '') + '…';
}

const clean = (s) => String(s || '').replace(/\*\*|__|`/g, '').replace(/^[\s"'“”‘’「『]+|[\s"'“”‘’」』]+$/g, '').trim();

function splitName(raw) {
  const s = clean(raw);
  const m = s.match(/^(.*?)\s*[(（]\s*([A-Za-z][^)）]*)[)）]\s*$/);
  return m ? { ko: m[1].trim(), en: m[2].trim() } : { ko: s, en: '' };
}

function parseColor(value) {
  const m = value.match(/#\s*([0-9a-fA-F]{6})(?![0-9a-fA-F])/);
  if (!m) return null;
  const rest = value.slice(m.index + m[0].length).replace(/^[\s·•∙|,:\-–—]+/, '');
  const parts = rest.split(SEP).map(clean).filter(Boolean);
  const name = splitName(parts[0] || '');
  return { hex: '#' + m[1].toUpperCase(), ...name, why: parts.slice(1).join(' · ') };
}

export function parse(text) {
  const raw = String(text || '');
  if (!raw.trim()) return { error: '붙여 넣은 내용이 비어 있어요.' };
  if (/#RRGGBB/.test(raw) && /잠시 역할극 중단/.test(raw)) {
    return { error: 'OOC 문장이 그대로 들어왔어요. 채팅에서 받은 답을 복사해 붙여 주세요.' };
  }

  const names = ['', ''];
  const slot = () => ({ sym: null, love: null, kw: [], finish: null, finishWhy: '' });
  const who = [slot(), slot()];
  const seen = {};
  const out = { ratio: null, ratioWhy: '', mix: { ko: '', en: '', desc: '' }, line: '' };

  const side = (prefix, kind) => {
    const p = prefix.replace(/[\s\[\]【】\-*•·\d.)]/g, '');
    let i = -1;
    if (/NPC/i.test(p)) i = 0;
    else if (/PC|유저|user/i.test(p)) i = 1;
    else if (names[0] && p.includes(names[0])) i = 0;
    else if (names[1] && p.includes(names[1])) i = 1;
    if (i < 0) i = (seen[kind] || 0) % 2;
    seen[kind] = (seen[kind] || 0) + 1;
    return i;
  };

  for (const line0 of raw.split(/\r?\n/)) {
    const line = line0.replace(/\*\*|__|`/g, '').replace(/^\s*(?:[-*•>]\s+|#{1,6}\s+)/, '').trim();
    const m = line.match(KEY_RE);
    if (!m) continue;
    const [, prefix, key0, value] = m;
    const key = key0.replace(/\s/g, '');
    if (prefix.length > 24) continue;

    if (key === '대상') {
      const ns = value.split(/\s*[\/／|,&×xX]\s*|\s+(?:과|와|and)\s+/).map(clean).filter(Boolean);
      if (ns[0]) names[0] = ns[0].replace(/^NPC\s*[:：]?\s*/i, '');
      if (ns[1]) names[1] = ns[1].replace(/^PC\s*[:：]?\s*/i, '');
    } else if (key.startsWith('상징색')) {
      const c = parseColor(value);
      if (c) who[side(prefix, 'sym')].sym = c;
    } else if (key.startsWith('사랑색')) {
      const c = parseColor(value);
      if (c) who[side(prefix, 'love')].love = c;
    } else if (key === '키워드') {
      who[side(prefix, 'kw')].kw = value.split(/\s*[,，、·/#]\s*/).map(clean).filter(Boolean).slice(0, 6);
    } else if (key === '질감') {
      const w = who[side(prefix, 'fin')];
      const parts = value.split(SEP).map(clean).filter(Boolean);
      const f = FINISH.find(([, re]) => re.test(parts[0] || value));
      if (f) { w.finish = f[0]; w.finishLabel = f[2]; }
      w.finishWhy = parts.slice(1).join(' · ');
    } else if (key === '혼합비율') {
      const parts = value.split(/\s*[·•∙|]\s*/);
      const nums = (parts[0].match(/\d+(?:\.\d+)?/g) || []).map(Number);
      if (nums.length >= 2 && nums[0] + nums[1] > 0) {
        const a = Math.round(nums[0] / (nums[0] + nums[1]) * 100);
        out.ratio = [a, 100 - a];
      }
      out.ratioWhy = parts.slice(1).map(clean).join(' · ');
    } else if (key === '혼합색이름' || key === '혼합색') {
      const v = value.replace(/#\s*[0-9a-fA-F]{6}\s*[·•∙|]?\s*/, '');
      const parts = v.split(SEP).map(clean).filter(Boolean);
      Object.assign(out.mix, splitName(parts[0] || ''));
      if (parts[1] && !out.mix.desc) out.mix.desc = parts.slice(1).join(' · ');
    } else if (key === '혼합색설명') {
      out.mix.desc = clean(value);
    } else if (key.startsWith('한줄')) {
      out.line = clean(value);
    }
  }

  const missing = [];
  if (!who[0].sym) missing.push('NPC 상징색');
  if (!who[1].sym) missing.push('PC 상징색');
  if (!who[0].love) missing.push('NPC 사랑색');
  if (!who[1].love) missing.push('PC 사랑색');
  if (missing.length === 4) return { error: '색을 찾지 못했어요. #RRGGBB 색 코드가 들어 있는 답인지 확인해 주세요.' };
  if (missing.length) return { error: `빠진 항목이 있어요: ${missing.join(', ')}` };

  const tidy = (w, fallback) => {
    const col = (c) => c && { hex: c.hex, ko: clip(c.ko, LIMITS.colorName), en: clip(c.en, LIMITS.en), why: clip(c.why, LIMITS.why) };
    return {
      ...w,
      name: clip(fallback, LIMITS.name),
      sym: col(w.sym),
      love: col(w.love),
      kw: w.kw.map((k) => clip(k, LIMITS.kw)).filter(Boolean).slice(0, 3),
      finishWhy: clip(w.finishWhy, LIMITS.finishWhy),
    };
  };
  return {
    data: {
      a: tidy(who[0], names[0] || 'NPC'),
      b: tidy(who[1], names[1] || 'PC'),
      ratio: out.ratio || [50, 50],
      ratioWhy: clip(out.ratioWhy, LIMITS.ratioWhy),
      mix: { ko: clip(out.mix.ko, LIMITS.colorName), en: clip(out.mix.en, LIMITS.en), desc: clip(out.mix.desc, LIMITS.desc) },
      line: clip(out.line, LIMITS.line),
    },
  };
}
