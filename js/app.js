import { buildPrompt, parse, clip, LIMITS } from './ooc.js';
import { EXAMPLE } from './data.js';
import { colorName, reason, keywords, finish, mixName, mixDesc, phrase, ratioWhy } from './describe.js';
import {
  INK, ink, mix, tone, ladder, hexToRgb, hsl, cmyk, code, temp, hueGap, relation, contrast, clamp,
} from './color.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ease = (t) => 1 - (1 - clamp(t)) ** 3;
const range = (p, a, b) => clamp((p - a) / (b - a));
const inout = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

const store = {
  get(k) { try { return localStorage.getItem('love-color:' + k); } catch { return null; } },
  set(k, v) {
    try {
      if (v == null || v === '') localStorage.removeItem('love-color:' + k);
      else localStorage.setItem('love-color:' + k, v);
    } catch {}
  },
};

const bg = $('.bg');
const result = $('#result');
const input = $('#input');
const err = $('#err');
let state = null;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), 1800);
}

async function copy(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }
  toast(msg);
}

const pale = (h) => tone(h, 0.9, 0.45);
const HOME_TINT = '#6F4BD8';
let stops = [];
function paint(hex, g) {
  bg.style.setProperty('--tint', hex);
  bg.style.setProperty('--g', g.toFixed(4));
}
paint(pale(HOME_TINT), 0.5);

function buildStops() {
  if (!state) return;
  const c = state.c;
  const at = (id, f) => { const el = $('#' + id); return el.offsetTop + el.offsetHeight * f; };
  const vh = innerHeight;
  stops = [
    [0, c.mix],
    [at('s-hero', 0.5) - vh / 2, c.mix],
    [at('s-a', 0.5) - vh / 2, c.sa],
    [at('s-b', 0.5) - vh / 2, c.sb],
    [at('s-love', 0.25) - vh / 2, c.la],
    [at('s-love', 0.75) - vh / 2, c.lb],
    [at('s-mixd', 0.5) - vh / 2, c.mix],
    [at('s-pal', 0.5) - vh / 2, c.la],
    [at('s-final', 0.5) - vh / 2, c.mix],
  ].map(([y, h]) => [y, pale(h)]);
}

function flow(y) {
  if (!stops.length) return;
  let i = 0;
  while (i < stops.length - 2 && y > stops[i + 1][0]) i++;
  const [y0, h0] = stops[i], [y1, h1] = stops[i + 1];
  const t = y1 > y0 ? clamp((y - y0) / (y1 - y0)) : 1;
  paint(mix(h0, h1, t), 0.5 + 0.5 * Math.sin(y / innerHeight * 1.1));
}

const pairIn = $('#pairInput');
const stepEl = (k) => $(`.step[data-step="${k}"]`);
const EDIT = [['sa', 'a', 'sym', 'NPC · 상징색'], ['la', 'a', 'love', 'NPC · 사랑색'], ['sb', 'b', 'sym', 'PC · 상징색'], ['lb', 'b', 'love', 'PC · 사랑색']];
const HEX_RE = /^#?([0-9a-f]{6})$/i;
let answer = null;
let edits = {};

const LIMIT = { pairInput: 16, dA: 12, dB: 12, color: 12, dLine: 40 };
const clean = (v, max) => v.replace(/[\u0000-\u001F\u007F]/g, '').replace(/^\s+/, '').replace(/\s{2,}/g, ' ').slice(0, max);
function sanitize(el, max) {
  const v = clean(el.value, max);
  if (v !== el.value) el.value = v;
  return v;
}
function paintCount(el, max) {
  const c = $('#' + { pairInput: 'pairCount', dA: 'dAcount', dB: 'dBcount', dLine: 'dLineCount' }[el.id]);
  if (!c) return;
  const n = [...el.value].length;
  c.textContent = `${n}/${max}`;
  c.classList.toggle('full', n >= max);
}
const goErr = (msg) => { const e = $('#goErr'); e.textContent = msg || ''; e.hidden = !msg; };
const fail = (msg) => { err.textContent = msg || ''; err.hidden = !msg; };
const original = (k) => { const [, who, kind] = EDIT.find((e) => e[0] === k); return answer[who][kind].hex; };

function paintPair() {
  const v = pairIn.value.trim();
  stepEl('pair').dataset.state = v ? 'done' : 'empty';
}

function paintSteps() {
  const done = !!answer;
  stepEl('answer').dataset.state = done ? 'done' : 'empty';
  $('#got').hidden = !done;
  $('#ansActs').hidden = done;
  $('#minor').hidden = done;
  if (done) {
    $('#gotText').textContent = `${answer.a.name} · ${answer.b.name}의 네 가지 색`;
    input.hidden = true;
    $('#taActs').hidden = true;
    $('#promptView').hidden = true;
  }
  paintGo();
  buildEditor();
}

function paintColStatus() {
  const n = Object.keys(edits).length;
  stepEl('colors').hidden = !answer;
  stepEl('colors').dataset.state = n ? 'done' : 'empty';
  $('#colStatus').textContent = n ? `${n}색 수정됨` : '';
  $('#colReset').hidden = !n;
}

function buildEditor() {
  const ed = $('#editor');
  if (!answer) { ed.innerHTML = ''; paintColStatus(); return; }
  ed.innerHTML = EDIT.map(([k, who, kind, label]) => {
    const p = answer[who];
    const hex = edits[k] || p[kind].hex;
    return `<li data-k="${k}" class="${edits[k] ? 'changed' : ''}">
      <label class="swatch-in" style="--c:${hex}"><input type="color" value="${hex.toLowerCase()}" aria-label="${esc(p.name)} ${label.split(' · ')[1]} 고르기" /></label>
      <span class="who-l"><small>${esc(p.name)} · ${label.split(' · ')[1]}</small><span class="who-t">${esc(p[kind].ko)}</span></span>
      <input class="hex-in" type="text" value="${hex}" maxlength="7" spellcheck="false" aria-label="${esc(p.name)} ${label.split(' · ')[1]} 색 코드" />
    </li>`;
  }).join('');
  paintColStatus();
}

function setEdit(k, hex, from) {
  const li = $(`#editor li[data-k="${k}"]`);
  hex = hex.toUpperCase();
  if (hex === original(k).toUpperCase()) delete edits[k];
  else edits[k] = hex;
  store.set('edits', Object.keys(edits).length ? JSON.stringify(edits) : '');
  $('.swatch-in', li).style.setProperty('--c', hex);
  if (from !== 'color') $('input[type=color]', li).value = hex.toLowerCase();
  if (from !== 'hex') { const h = $('.hex-in', li); h.value = hex; h.classList.remove('bad'); }
  li.classList.toggle('changed', !!edits[k]);
  paintColStatus();
}

function accept(text, quiet) {
  const r = parse(text);
  if (r.error) { if (!quiet) fail(r.error); return false; }
  answer = r.data;
  if (!quiet) { edits = {}; store.set('edits', ''); }
  store.set('answer', text);
  fail('');
  paintSteps();
  if (!quiet) { toast('OOC 답 입력 완료'); $('#openBtn').focus({ preventScroll: true }); }
  return true;
}

function openManual(msg) {
  input.hidden = false;
  $('#taActs').hidden = false;
  input.focus();
  if (msg) fail(msg);
}

$('#paneOoc').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'copy') copy(buildPrompt(), 'OOC를 복사했어요. 채팅에 보내 주세요.');
  else if (act === 'paste') {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { return openManual('브라우저가 클립보드 읽기를 막았어요. 아래 칸에 직접 붙여 넣어 주세요.'); }
    if (!text.trim()) return fail('클립보드가 비어 있어요. 채팅에서 AI의 답을 복사한 뒤 다시 눌러 주세요.');
    accept(text);
  } else if (act === 'manual') openManual();
  else if (act === 'confirm') {
    if (!input.value.trim()) { fail('붙여 넣은 내용이 없어요. AI가 쓴 답을 넣은 뒤 눌러 주세요.'); input.focus(); return; }
    accept(input.value);
  } else if (act === 'cancel') { input.hidden = true; $('#taActs').hidden = true; fail(''); }
  else if (act === 'peek') {
    const pre = $('#promptView'), show = pre.hidden;
    pre.textContent = buildPrompt();
    pre.hidden = !show;
    btn.setAttribute('aria-expanded', String(show));
    btn.textContent = show ? 'OOC 내용 접기' : 'OOC 내용 보기';
  } else if (act === 'redo' || act === 'clear') {
    const keep = act === 'redo' ? store.get('answer') || '' : '';
    answer = null;
    edits = {};
    store.set('answer', '');
    store.set('edits', '');
    input.value = keep;
    fail('');
    paintSteps();
    if (act === 'redo') openManual();
  }
});
input.addEventListener('input', () => fail(''));

$('#editor').addEventListener('input', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const k = li.dataset.k;
  if (e.target.type === 'color') setEdit(k, e.target.value, 'color');
  else if (e.target.classList.contains('hex-in')) {
    const m = e.target.value.trim().match(HEX_RE);
    e.target.classList.toggle('bad', !m);
    if (m) setEdit(k, '#' + m[1], 'hex');
  }
});
$('#editor').addEventListener('focusout', (e) => {
  if (!e.target.classList.contains('hex-in')) return;
  const li = e.target.closest('li');
  e.target.value = edits[li.dataset.k] || original(li.dataset.k);
  e.target.classList.remove('bad');
});
$('#colReset').addEventListener('click', () => {
  edits = {};
  store.set('edits', '');
  buildEditor();
  toast('원래 색으로 돌렸어요.');
});

pairIn.addEventListener('input', () => { sanitize(pairIn, LIMIT.pairInput); paintCount(pairIn, LIMIT.pairInput); store.set('pair', pairIn.value.trim()); paintPair(); });
pairIn.addEventListener('blur', () => { pairIn.value = pairIn.value.trim(); paintCount(pairIn, LIMIT.pairInput); });

let mode = store.get('mode') === 'direct' ? 'direct' : 'ooc';
function setMode(m, focus) {
  mode = m;
  store.set('mode', m === 'direct' ? 'direct' : '');
  $$('.tab').forEach((t) => {
    const on = t.dataset.mode === m;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  });
  $('#paneOoc').hidden = m !== 'ooc';
  $('#paneDirect').hidden = m !== 'direct';
  goErr('');
  paintGo();
}
$('.tabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t && t.dataset.mode !== mode) { resetInputs(); setMode(t.dataset.mode); } });
$('.tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  resetInputs();
  setMode(mode === 'ooc' ? 'direct' : 'ooc', true);
});

const DKEYS = [['sa', 'a', '상징색'], ['la', 'a', '사랑색'], ['sb', 'b', '상징색'], ['lb', 'b', '사랑색']];
const DDEF = { a: '', b: '', ratio: 50, line: '', c: { sa: ['#27335C', ''], la: ['#6F4BD8', ''], sb: ['#F4B79C', ''], lb: ['#FF8FA3', ''] } };
let direct = structuredClone(DDEF);
try {
  const v = JSON.parse(store.get('direct') || 'null');
  if (v && v.c) {
    direct.a = clean(String(v.a || ''), LIMIT.dA);
    direct.b = clean(String(v.b || ''), LIMIT.dB);
    direct.ratio = clamp(Number(v.ratio) || 50, 0, 100);
    direct.line = clean(String(v.line || ''), LIMIT.dLine);
    DKEYS.forEach(([k]) => { const x = v.c[k]; if (Array.isArray(x) && HEX_RE.test(x[0])) direct.c[k] = [x[0].toUpperCase().replace(/^([^#])/, '#$1'), clean(String(x[1] || ''), LIMIT.color)]; });
  }
} catch {}
const saveDirect = () => store.set('direct', JSON.stringify(direct));
const dName = (w) => direct[w].trim() || (w === 'a' ? '캐릭터 1' : '캐릭터 2');

function buildDirect() {
  $('#dA').value = direct.a;
  $('#dB').value = direct.b;
  paintCount($('#dA'), LIMIT.dA);
  paintCount($('#dB'), LIMIT.dB);
  $('#dRatio').value = direct.ratio;
  $('#dLine').value = direct.line;
  paintCount($('#dLine'), LIMIT.dLine);
  $('#dEditor').innerHTML = DKEYS.map(([k, w, label]) => {
    const [hex, nm] = direct.c[k];
    return `<li data-k="${k}">
      <label class="swatch-in" style="--c:${hex}"><input type="color" value="${hex.toLowerCase()}" aria-label="${label} 고르기" /></label>
      <span class="who-l"><small data-w="${w}" data-l="${label}"></small><input class="name-in" type="text" value="${esc(nm)}" maxlength="12" placeholder="${esc(colorName(hex).ko)}" aria-label="${label} 이름" /></span>
      <input class="hex-in" type="text" value="${hex}" maxlength="7" spellcheck="false" aria-label="${label} 색 코드" />
    </li>`;
  }).join('');
  paintDirect();
}

function paintDirect() {
  $$('#dEditor li').forEach((li) => { const n = $('.name-in', li); if (n) n.placeholder = colorName(direct.c[li.dataset.k][0]).ko; });
  const ln = $('#dLine');
  if (ln) ln.placeholder = phrase(direct.c.la[0], direct.c.lb[0]);
  const ok = direct.a.trim() && direct.b.trim();
  stepEl('dnames').dataset.state = ok ? 'done' : 'empty';
  $$('#dEditor small[data-w]').forEach((el) => { el.textContent = `${dName(el.dataset.w)} · ${el.dataset.l}`; });
  const r = direct.ratio;
  $('#mpA').textContent = `${dName('a')} ${100 - r}%`;
  $('#mpB').textContent = `${dName('b')} ${r}%`;
  const box = $('#paneDirect');
  box.style.setProperty('--dla', direct.c.la[0]);
  box.style.setProperty('--dlb', direct.c.lb[0]);
  $('[data-mp="a"] i').style.setProperty('--c', direct.c.la[0]);
  $('[data-mp="b"] i').style.setProperty('--c', direct.c.lb[0]);
  $('.mp.mid i').style.setProperty('--c', mix(direct.c.la[0], direct.c.lb[0], r / 100));
  paintGo();
}

function setDirectColor(k, hex, from) {
  const li = $(`#dEditor li[data-k="${k}"]`);
  hex = hex.toUpperCase();
  direct.c[k][0] = hex;
  $('.swatch-in', li).style.setProperty('--c', hex);
  if (from !== 'color') $('input[type=color]', li).value = hex.toLowerCase();
  if (from !== 'hex') { const h = $('.hex-in', li); h.value = hex; h.classList.remove('bad'); }
  saveDirect();
  paintDirect();
}

$('#paneDirect').addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'dA' || t.id === 'dB') {
    const v = sanitize(t, LIMIT[t.id]);
    paintCount(t, LIMIT[t.id]);
    direct[t.id === 'dA' ? 'a' : 'b'] = v;
    t.closest('.field').classList.remove('bad');
    nameErr('');
    goErr('');
    saveDirect();
    return paintDirect();
  }
  if (t.id === 'dRatio') { direct.ratio = Number(t.value); saveDirect(); return paintDirect(); }
  if (t.id === 'dLine') { direct.line = sanitize(t, LIMIT.dLine); paintCount(t, LIMIT.dLine); saveDirect(); return; }
  const li = t.closest('li');
  if (!li) return;
  const k = li.dataset.k;
  if (t.type === 'color') setDirectColor(k, t.value, 'color');
  else if (t.classList.contains('name-in')) { direct.c[k][1] = sanitize(t, LIMIT.color); saveDirect(); }
  else if (t.classList.contains('hex-in')) {
    const m = t.value.trim().match(HEX_RE);
    t.classList.toggle('bad', !m);
    if (m) setDirectColor(k, '#' + m[1], 'hex');
  }
});
$('#paneDirect').addEventListener('focusout', (e) => {
  if (e.target.id === 'dA' || e.target.id === 'dB' || e.target.classList.contains('name-in')) {
    e.target.value = e.target.value.trim();
    if (e.target.id) { direct[e.target.id === 'dA' ? 'a' : 'b'] = e.target.value; paintCount(e.target, LIMIT[e.target.id]); }
    else direct.c[e.target.closest('li').dataset.k][1] = e.target.value;
    saveDirect();
    return;
  }
  if (!e.target.classList.contains('hex-in')) return;
  e.target.value = direct.c[e.target.closest('li').dataset.k][0];
  e.target.classList.remove('bad');
});

const nameErr = (msg) => { const e = $('#nameErr'); e.textContent = msg || ''; e.hidden = !msg; };
function setTip(open) {
  $('#mixTip').hidden = !open;
  $('#mixTipBtn').setAttribute('aria-expanded', String(open));
}
$('#mixTipBtn').addEventListener('click', (e) => { e.stopPropagation(); setTip(true); });
$('#mixTipBtn').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') setTip(true); });
$('.mix-head').addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') setTip(false); });
document.addEventListener('click', (e) => { if (!e.target.closest('#mixTip')) setTip(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setTip(false); });

function validDirect(show) {
  const a = direct.a.trim(), b = direct.b.trim();
  let msg = '', el = null;
  if (!a) { msg = '첫 번째 캐릭터의 이름을 적어 주세요.'; el = $('#dA'); }
  else if (!b) { msg = '두 번째 캐릭터의 이름을 적어 주세요.'; el = $('#dB'); }
  else if (a === b) { msg = '두 캐릭터의 이름이 같아요. 구별되게 적어 주세요.'; el = $('#dB'); }
  if (show) {
    $$('#paneDirect .name-pair .field').forEach((f) => f.classList.toggle('bad', !!el && f.contains(el)));
    nameErr(msg);
    if (el) el.focus();
  }
  return !msg;
}

function directData() {
  const person = (w) => {
    const name = direct[w].trim();
    const col = (k, kind) => {
      const [hex, nm] = direct.c[k];
      const auto = colorName(hex);
      const own = nm.trim();
      return { hex, ko: own || auto.ko, en: own ? '' : auto.en, why: reason(hex, kind) };
    };
    const love = col('l' + w, 'love');
    const f = finish(love.hex);
    return {
      name,
      sym: col('s' + w, 'sym'),
      love,
      kw: keywords(direct.c['s' + w][0]),
      finish: f.key, finishLabel: f.label, finishWhy: f.why,
    };
  };
  const a = person('a'), b = person('b');
  const ratio = [100 - direct.ratio, direct.ratio];
  const m = mix(a.love.hex, b.love.hex, ratio[1] / 100);
  const mn = mixName(m);
  return {
    a, b, ratio,
    ratioWhy: ratioWhy(ratio, a.name, b.name),
    mix: { ko: mn.ko, en: mn.en, desc: mixDesc(a.love.hex, b.love.hex) },
    line: direct.line.trim() || phrase(a.love.hex, b.love.hex),
  };
}

function paintGo() {
  const btn = $('#openBtn');
  if (!btn || typeof mode === 'undefined') return;
  const ready = mode === 'ooc' ? !!answer : validDirect(false);
  btn.setAttribute('aria-disabled', String(!ready));
  if (ready) goErr('');
}

$('#openBtn').addEventListener('click', () => {
  if (mode === 'direct') {
    if (!validDirect(true)) return goErr('캐릭터명을 확인해 주세요.');
    goErr('');
    return open(directData());
  }
  if (!answer) {
    goErr('OOC 답을 먼저 넣어 주세요.');
    stepEl('answer').scrollIntoView({ block: 'center', behavior: reduce.matches ? 'auto' : 'smooth' });
    return;
  }
  goErr('');
  const data = structuredClone(answer);
  EDIT.forEach(([k, who, kind]) => { if (edits[k]) data[who][kind].hex = edits[k]; });
  open(data);
});
$('#exampleBtn').addEventListener('click', () => open(parse(EXAMPLE).data, '늦은 불빛'));

function open(data, pairFallback = '') {
  state = data;
  state.pair = pairIn.value.trim() || pairFallback;
  state.base = [...state.ratio];
  render();
}

pairIn.value = clean(store.get('pair') || '', LIMIT.pairInput);
paintCount(pairIn, LIMIT.pairInput);
paintPair();
const saved = store.get('answer');
if (saved && accept(saved, true)) {
  try { edits = JSON.parse(store.get('edits') || '{}') || {}; } catch { edits = {}; }
  Object.keys(edits).forEach((k) => { if (!EDIT.some((e) => e[0] === k) || !HEX_RE.test(edits[k])) delete edits[k]; });
  buildEditor();
} else paintSteps();
buildDirect();
function restartAll() {
  resetInputs();
  pairIn.value = '';
  store.set('pair', '');
  paintCount(pairIn, LIMIT.pairInput);
  paintPair();
  store.set('mode', '');
  setMode('ooc');
  window.scrollTo(0, 0);
}

function resetInputs() {
  answer = null;
  edits = {};
  store.set('answer', '');
  store.set('edits', '');
  input.value = '';
  input.hidden = true;
  $('#taActs').hidden = true;
  $('#promptView').hidden = true;
  const peek = $('[data-act=peek]');
  peek.setAttribute('aria-expanded', 'false');
  peek.textContent = 'OOC 내용 보기';
  fail('');
  paintSteps();
  direct = structuredClone(DDEF);
  store.set('direct', '');
  $$('#paneDirect .name-pair .field').forEach((f) => f.classList.remove('bad'));
  nameErr('');
  setTip(false);
  buildDirect();
  goErr('');
}

setMode(mode);

const b64u = {
  enc: (bytes) => { let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); }); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: (str) => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
};
const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function pack(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (!canZip) return 'j' + b64u.enc(raw);
  const zipped = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  return 'z' + b64u.enc(zipped);
}

async function unpack(str) {
  let bytes = b64u.dec(str.slice(1));
  if (str[0] === 'z') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(bytes));
}

const snapPerson = (p) => ({
  n: p.name,
  s: [p.sym.hex, p.sym.ko, p.sym.en, p.sym.why],
  l: [p.love.hex, p.love.ko, p.love.en, p.love.why],
  k: p.kw,
  f: [p.finish || '', p.finishLabel || '', p.finishWhy || ''],
});

function snapshot() {
  return { v: 1, p: state.pair || '', a: snapPerson(state.a), b: snapPerson(state.b), r: state.ratio, rw: state.ratioWhy || '', m: [state.mix.ko || '', state.mix.en || '', state.mix.desc || ''], ln: state.line || '' };
}

const HEXOK = /^#[0-9A-F]{6}$/;
function restorePerson(x) {
  const col = (c) => {
    const hex = String(c?.[0] || '').toUpperCase();
    if (!HEXOK.test(hex)) throw new Error('bad colour');
    return { hex, ko: clip(c[1], LIMITS.colorName), en: clip(c[2], LIMITS.en), why: clip(c[3], LIMITS.why) };
  };
  const fin = Array.isArray(x.f) ? x.f : [];
  return {
    name: clip(x.n, LIMITS.name) || '—',
    sym: col(x.s),
    love: col(x.l),
    kw: (Array.isArray(x.k) ? x.k : []).map((k) => clip(k, LIMITS.kw)).filter(Boolean).slice(0, 3),
    finish: ['matte', 'gloss', 'pearl', 'velvet', 'sheer', 'metal'].includes(fin[0]) ? fin[0] : null,
    finishLabel: clip(fin[1], 8),
    finishWhy: clip(fin[2], LIMITS.finishWhy),
  };
}

function restore(d) {
  if (!d || d.v !== 1) throw new Error('bad version');
  const ra = Math.round(clamp(Number(d.r?.[0]), 0, 100));
  const m = Array.isArray(d.m) ? d.m : [];
  return {
    pair: clip(d.p, LIMIT.pairInput),
    a: restorePerson(d.a),
    b: restorePerson(d.b),
    ratio: Number.isFinite(ra) ? [ra, 100 - ra] : [50, 50],
    ratioWhy: clip(d.rw, LIMITS.ratioWhy),
    mix: { ko: clip(m[0], LIMITS.colorName), en: clip(m[1], LIMITS.en), desc: clip(m[2], LIMITS.desc) },
    line: clip(d.ln, LIMITS.line),
  };
}

const baseUrl = () => location.href.split('#')[0];

async function shareLink() {
  try {
    const url = `${baseUrl()}#r=${await pack(snapshot())}`;
    copy(url, '결과 링크를 복사했어요.');
  } catch {
    toast('링크를 만들지 못했어요.');
  }
}

function hideLoader() {
  const el = $('#loader');
  const done = () => { document.documentElement.classList.remove('from-link'); el.classList.remove('out'); };
  if (!document.documentElement.classList.contains('from-link')) return;
  if (reduce.matches) return done();
  el.classList.add('out');
  setTimeout(done, 700);
}

async function openFromLink() {
  const m = location.hash.match(/^#r=([jz][A-Za-z0-9_-]+)$/);
  if (!m) { hideLoader(); return false; }
  const t0 = performance.now();
  try {
    const data = restore(await unpack(m[1]));
    state = data;
    state.base = [...state.ratio];
    render();
    const wait = Math.max(0, 900 - (performance.now() - t0));
    setTimeout(hideLoader, reduce.matches ? 0 : wait);
    return true;
  } catch {
    history.replaceState(null, '', baseUrl());
    hideLoader();
    toast('링크를 열 수 없어요. 주소가 잘리지 않았는지 확인해 주세요.');
    return false;
  }
}

openFromLink();

function colors() {
  const { a, b, ratio } = state;
  return { sa: a.sym.hex, sb: b.sym.hex, la: a.love.hex, lb: b.love.hex, mix: mix(a.love.hex, b.love.hex, ratio[1] / 100) };
}

const chip = (hex, nm, extra = '') => `<figure class="chip"${extra}>
  <div class="chip-c" style="--c:${hex}"></div>
  <figcaption><b>LOVE COLOR</b><span>${code(hex)}</span><span class="nm">${esc(nm)}</span></figcaption>
</figure>`;

function spec(hex) {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = hsl(hex);
  return `<dl class="spec">
    <div><dt>HEX</dt><dd><button class="hexbtn" data-hex="${hex}">${hex}</button></dd></div>
    <div><dt>RGB</dt><dd>${r} ${g} ${b}</dd></div>
    <div><dt>CMYK</dt><dd>${cmyk(hex).join(' ')}</dd></div>
    <div><dt>HSL</dt><dd>${h}° ${s}% ${l}%</dd></div>
    <div><dt>CODE</dt><dd>${code(hex).replace('LC ', '')}</dd></div>
    <div><dt>TEMP</dt><dd>${temp(hex)}</dd></div>
  </dl>`;
}

function chapter(p, no, key, flip) {
  const c = p.sym;
  const lad = ladder(c.hex);
  return `<section class="sec chapter${flip ? ' flip' : ''}" data-theme="${key}" data-p id="s-${key}" aria-label="${esc(p.name)}의 상징색">
    <div class="ch-text">
      <p class="eyebrow ch-label rv">${no} · Symbol</p>
      ${c.ko !== `${p.name}의 색` ? `<p class="who rv" style="--d:1">${esc(p.name)}의 색</p>` : '<div class="why-gap"></div>'}
      <h2 class="cko rv" style="--d:2">${esc(c.ko)}</h2>
      ${c.en ? `<p class="cen rv" style="--d:3">${esc(c.en)}</p>` : ''}
      ${c.why ? `<p class="why rv" style="--d:4">${esc(c.why)}</p>` : '<div class="why-gap"></div>'}
      ${p.kw.length ? `<ul class="tags rv" style="--d:5">${p.kw.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}
      <div class="rv" style="--d:6">${spec(c.hex)}</div>
    </div>
    <div class="ch-visual rv" style="--d:2">
      ${chip(c.hex, c.en || c.ko)}
      <ol class="ladder" aria-hidden="true">
        ${lad.map((h, i) => `<li class="${i === 3 ? 'main' : ''}" style="--i:${i};--c:${h};--k:${ink(h)}">${h.slice(1)}</li>`).join('')}
      </ol>
    </div>
  </section>`;
}

function loveItem(p) {
  const c = p.love;
  return `<article class="love-item" data-p>
    <div class="sample" data-finish="${p.finish || 'matte'}" style="--c:${c.hex};--k:${ink(c.hex)}">
      <i class="sheen" aria-hidden="true"></i>
      <span class="sample-tag"><span>${esc(p.finishLabel || '')}</span><span>${c.hex}</span></span>
    </div>
    ${c.ko !== `${p.name}의 사랑` ? `<p class="eyebrow kr rv">${esc(p.name)}의 사랑</p>` : ''}
    <h3 class="cko rv" style="--d:1">${esc(c.ko)}</h3>
    ${c.en ? `<p class="cen rv" style="--d:2">${esc(c.en)}</p>` : ''}
    ${c.why ? `<p class="why rv" style="--d:3">${esc(c.why)}</p>` : ''}
    ${p.finishLabel || p.finishWhy ? `<p class="finish rv" style="--d:4">${p.finishLabel ? `<b>${esc(p.finishLabel)}</b>` : ''}${esc(p.finishWhy)}</p>` : ''}
  </article>`;
}

function render() {
  const { a, b } = state;
  const c = colors();
  const mixKo = state.mix.ko || '혼합색';
  const mixEn = state.mix.en || '';
  const [rel, relWhy] = relation(c.sa, c.sb);
  const bars = [
    ['sa', `${esc(a.name)} · SYMBOL`, a.sym.ko],
    ['la', `${esc(a.name)} · LOVE`, a.love.ko],
    ['mix', 'BLEND', mixKo],
    ['lb', `${esc(b.name)} · LOVE`, b.love.ko],
    ['sb', `${esc(b.name)} · SYMBOL`, b.sym.ko],
  ];
  const phrase = state.line || state.pair || `${a.name} & ${b.name}`;
  const heroLines = (() => { let i = 0; return phrase.split(/\s+/).map((w) => `<span class="w">${[...w].map((ch) => `<span style="--i:${i++}">${esc(ch)}</span>`).join('')}</span>`).join(' '); })();

  result.innerHTML = `
    <div class="prog" id="prog"></div>
    <header class="bar">
      <button type="button" class="mono" data-act="home">← Love Color</button>
    </header>
    <nav class="rail" id="rail" aria-label="장 이동"></nav>

    <section class="sec hero" data-theme="hero" id="s-hero" aria-label="오프닝">
      <div class="hero-pin">
        <div class="hero-copy">
          <h1 class="hero-line">${heroLines}</h1>
          <i class="hero-rule" aria-hidden="true"></i>
          <div class="hero-scroll" aria-hidden="true" style="--cue:${(Math.max([...phrase.replace(/\s+/g, '')].length * 0.06 + 1.8, 3.4) + 0.15).toFixed(2)}s"><span>SCROLL</span><i></i></div>
        </div>
      </div>
    </section>

    ${chapter(a, '01', 'a', false)}
    ${chapter(b, '02', 'b', true)}

    <section class="sec love" data-theme="love" id="s-love" aria-label="사랑의 색">
      <div class="love-head">
        <div>
          <p class="eyebrow ch-label rv">03 · LOVE COLORS</p>
          <h2 class="big rv" style="--d:1">How they <i>love</i></h2>
        </div>
        <p class="mono rv" style="--d:2">Finish &amp; Surface</p>
      </div>
      <div class="love-grid">
        ${loveItem(a)}
        ${loveItem(b)}
      </div>
    </section>

    <section class="sec mixd" data-theme="mixd" id="s-mixd" aria-label="혼합색">
      <div class="blend-pin" id="blendPin">
        <div class="blend-stage">
      <div class="blend-top">
        <p class="eyebrow ch-label">04 · THE BLEND</p>
        <p class="mix-steps" aria-hidden="true"><span data-step="0">MEET</span><span data-step="1">DIFFUSE</span><span data-step="2">BLEND</span></p>
      </div>
      <div class="mesh" id="mesh">
        <div class="bm bm-a"></div>
        <div class="bm bm-b"></div>
        <div class="bm bm-g"></div>
        <div class="bm bm-f"></div>
        <div class="mesh-type">
          <p class="mono"><span data-bind="mixhexTxt"></span></p>
          <h3>${esc(mixKo)}${mixEn ? `<i>${esc(mixEn)}</i>` : ''}</h3>
          <p class="mesh-sw"><span style="--c:var(--la)">${esc(a.love.ko)}</span><span style="--c:var(--mix)">${esc(mixKo)}</span><span style="--c:var(--lb)">${esc(b.love.ko)}</span></p>
        </div>
        <p class="bm-tag a">${esc(a.name)}<b>${esc(a.love.ko)}</b></p>
        <p class="bm-tag b">${esc(b.name)}<b>${esc(b.love.ko)}</b></p>
      </div>
        </div>
      </div>
      <p class="mix-hex rv"><button class="hexbtn" data-hex="" data-bind="mixhex"></button></p>
      <div class="mixd-grid">
        <div>
          <h2 class="cko rv" style="--d:1">${esc(mixKo)}</h2>
          ${mixEn ? `<p class="cen rv" style="--d:2">${esc(mixEn)}</p>` : ''}
          ${state.mix.desc ? `<p class="desc rv" style="--d:3">${esc(state.mix.desc)}</p>` : ''}
        </div>
        <div class="ratio rv" style="--d:2">
          <div class="ratio-top">
            <div>${esc(a.name)}<b data-bind="ra"></b></div>
            <div>${esc(b.name)}<b data-bind="rb"></b></div>
          </div>
          <input type="range" id="ratio" min="0" max="100" step="1" aria-label="두 사랑색의 혼합 비율" />
          ${state.ratioWhy ? `<p class="ratio-note">${esc(state.ratioWhy)}</p>` : ''}
          <div class="ratio-foot">
            <p class="ratio-note">막대를 움직여 다른 비율로 섞어 볼 수 있어요.</p>
            <button class="ratio-reset" type="button" data-act="ratio" disabled><span aria-hidden="true">↺</span> 원래 비율 <b>${state.base[0]} : ${state.base[1]}</b></button>
          </div>
        </div>
      </div>
    </section>

    <section class="sec pal" data-theme="pal" id="s-pal" aria-label="팔레트">
      <div class="pal-head">
        <div>
          <p class="eyebrow ch-label rv">05 · PALETTE</p>
          <h2 class="big rv" style="--d:1">Five <i>swatches</i></h2>
        </div>
        <p class="mono rv" style="--d:2">Tap to copy</p>
      </div>
      <div class="bars rv">
        ${bars.map(([k, role, nm], i) => `<button type="button" class="pbar${k === 'mix' ? ' mixbar' : ''}" data-bar="${k}" style="--d:${i}">
          <span class="role">${role}</span>
          <span><span class="nm">${esc(nm)}</span><span class="hx" data-bind="hx-${k}"></span></span>
        </button>`).join('')}
      </div>
      <div class="harm">
        <div class="spectrum rv" id="spectrum" aria-hidden="true">
          ${['sa', 'la', 'mix', 'lb', 'sb'].map((k, i) => `<div class="tick" data-tk="${k}" style="--d:${i};--row:${i % 3}"><i></i><span>${k === 'mix' ? 'BLEND' : esc(k[1] === 'a' ? a.name : b.name) + (k[0] === 's' ? ' · SYMBOL' : ' · LOVE')}</span></div>`).join('')}
          <div class="spectrum-bar"></div>
          <div class="spectrum-scale"><span>0°</span><span>90°</span><span>180°</span><span>270°</span><span>360°</span></div>
        </div>
        <dl class="stats">
          <div class="stat rv"><dt>RELATION</dt><dd><b>${rel}</b><span>${relWhy}</span></dd></div>
          <div class="stat rv" style="--d:1"><dt>HUE GAP</dt><dd><b>${hueGap(c.sa, c.sb)}°</b><span>두 상징색 사이의 색상 거리</span></dd></div>
          <div class="stat rv" style="--d:2"><dt>CONTRAST</dt><dd><b>${contrast(c.sa, c.sb).toFixed(2)} : 1</b><span>두 상징색의 밝기 대비</span></dd></div>
          <div class="stat rv" style="--d:3"><dt>TEMPERATURE</dt><dd><b>${temp(c.sa)} · ${temp(c.sb)}</b><span>${esc(a.name)} · ${esc(b.name)}</span></dd></div>
        </dl>
      </div>
    </section>

    <section class="sec final" data-theme="final" id="s-final" aria-label="견본 카드">
      <p class="eyebrow rv">06 · SWATCH CARD</p>
      <div class="card rv" id="card">
        <div class="card-art">
          <span></span>
          <h3>${state.pair ? `${esc(state.pair)}<i>${esc(a.name)}<span class="amp">&amp;</span>${esc(b.name)}</i>` : `<span class="nm2">${esc(a.name)}</span><span class="amp">&amp;</span><span class="nm2">${esc(b.name)}</span>`}</h3>
        </div>
        <div class="card-info">
          <b>LOVE COLOR</b>
          <span data-bind="mixhexTxt"></span>
          <span>${esc([mixKo, mixEn].filter(Boolean).join(' · '))}</span>
          <div class="card-strip">${['sa', 'la', 'mix', 'lb', 'sb'].map((k) => `<i style="--c:var(--${k})"></i>`).join('')}</div>
        </div>
      </div>
      <div class="actions rv">
        <button class="btn" type="button" data-act="save">카드 이미지 저장</button>
        <button class="btn" type="button" data-act="share">링크 복사</button>
        <button class="btn" type="button" data-act="hexes">색 코드 복사</button>
        <button class="btn" type="button" data-act="edit">테스트 다시하기</button>
      </div>
    </section>
    <p class="foot credit">@gimyunseul92364</p>`;

  document.body.dataset.view = 'result';
  result.hidden = false;
  window.scrollTo(0, 0);
  $('#ratio').value = state.ratio[1];
  buildRail();
  applyColors();
  observe();
  heroInit();
  onScroll();
}

function blendStops(c) {
  return Array.from({ length: 11 }, (_, j) => {
    const t = j / 10;
    return t <= 0.5 ? mix(c.la, c.mix, t * 2) : mix(c.mix, c.lb, (t - 0.5) * 2);
  });
}

function applyColors() {
  const c = colors();
  state.c = c;
  Object.entries(c).forEach(([k, v]) => result.style.setProperty('--' + k, v));
  result.style.setProperty('--mix-ink', ink(c.mix));
  result.style.setProperty('--blend', blendStops(c).join(', '));
  result.style.setProperty('--ka', ink(c.la));
  result.style.setProperty('--kb', ink(c.lb));
  $$('[data-bind=mixhex]', result).forEach((el) => {
    el.textContent = c.mix;
    if (el.dataset.hex !== undefined) el.dataset.hex = c.mix;
  });
  $$('[data-bind=mixhexTxt]', result).forEach((el) => { el.textContent = c.mix; });
  $('[data-bind=ra]', result).textContent = state.ratio[0] + '%';
  $('[data-bind=rb]', result).textContent = state.ratio[1] + '%';
  $$('[data-bind=ratioTxt]', result).forEach((el) => { el.textContent = `${state.ratio[0]} : ${state.ratio[1]}`; });
  $('.ratio-reset', result).disabled = state.ratio[0] === state.base[0];
  ['sa', 'la', 'mix', 'lb', 'sb'].forEach((k) => {
    const bar = $(`[data-bar=${k}]`, result);
    bar.style.setProperty('--c', c[k]);
    bar.style.setProperty('--k', ink(c[k]));
    $(`[data-bind=hx-${k}]`, result).textContent = c[k];
    const tk = $(`[data-tk=${k}]`, result);
    const hue = hsl(c[k])[0];
    tk.style.setProperty('--c', c[k]);
    tk.style.setProperty('--x', `calc(${hue / 360} * var(--sw, 0px))`);
    tk.classList.toggle('r', hue > 250);
  });
  sizeSpectrum();
  buildStops();
  current = null;
  onScroll();
}

function sizeSpectrum() {
  const s = $('#spectrum');
  if (s) s.style.setProperty('--sw', s.clientWidth + 'px');
}

function buildRail() {
  const RAIL = [['hero', '오프닝'], ['a', `${state.a.name}의 상징색`], ['b', `${state.b.name}의 상징색`], ['love', '사랑의 색'], ['mixd', '혼합색'], ['pal', '팔레트'], ['final', '카드']];
  $('#rail').innerHTML = RAIL.map(([k, label]) => `<a href="#s-${k}" data-t="${k}" aria-label="${esc(label)}"><i></i></a>`).join('');
}

let io;
function observe() {
  io?.disconnect();
  io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    $$('.ladder', e.target).forEach((l) => l.classList.add('in'));
    $$(':scope > .sample', e.target).forEach((l) => l.classList.add('in'));
    io.unobserve(e.target);
  }), { rootMargin: '0px 0px -12% 0px', threshold: 0.06 });
  $$('.rv, .bars, .spectrum', result).forEach((el) => io.observe(el));
  $$('.sample', result).forEach((el) => io.observe(el.parentElement));
}

let current = null;
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(frame);
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', () => { if (!state) return; sizeSpectrum(); buildStops(); onScroll(); });

const pinP = (el, vh) => {
  const r = el.getBoundingClientRect();
  return clamp(-r.top / (r.height - vh || 1));
};

function frame() {
  ticking = false;
  if (!state || result.hidden) return;
  const vh = innerHeight;
  const still = reduce.matches;
  const doc = document.documentElement;
  flow(scrollY);
  $('#prog').style.transform = `scaleX(${clamp(scrollY / (doc.scrollHeight - vh || 1))})`;

  let active = 'a';
  $$('[data-theme]', result).forEach((s) => {
    const r = s.getBoundingClientRect();
    if (r.top <= vh * 0.5 && r.bottom > vh * 0.5) active = s.dataset.theme;
  });
  if (active !== current) {
    current = active;
    $$('.rail a', result).forEach((a) => a.classList.toggle('on', a.dataset.t === active));
  }

  const hs = $('#s-hero');
  if (hs && hero.on) {
    const hp = still ? 1 : pinP(hs, vh);
    const out = ease(range(hp, 0.15, 0.9));
    const copy = $('.hero-copy', hs);
    copy.style.opacity = 1 - out;
    copy.style.transform = `translateY(${-out * 60}px)`;
    copy.style.filter = `blur(${out * 6}px)`;
  }

  const bp = $('#blendPin');
  if (bp) {
    const p = still ? 1 : pinP(bp, vh);
    const meet = ease(range(p, 0.02, 0.3));
    const diffuse = inout(range(p, 0.32, 0.66));
    const settle = range(p, 0.66, 0.82);
    const m = $('#mesh');
    $('.bm-a', m).style.transform = `translateX(${-(1 - meet) * 101}%)`;
    $('.bm-b', m).style.transform = `translateX(${(1 - meet) * 101}%)`;
    const g = $('.bm-g', m);
    g.style.opacity = meet > 0.995 ? 1 : 0;
    g.style.setProperty('--s', diffuse.toFixed(4));
    $('.bm-f', m).style.opacity = settle;
    const tags = Math.min(meet, 1 - range(p, 0.36, 0.56));
    $$('.bm-tag', m).forEach((t) => { t.style.opacity = tags; });
    const type = $('.mesh-type', m);
    const tin = ease(range(p, 0.74, 0.92));
    type.style.opacity = tin;
    type.style.transform = `translateY(${(1 - tin) * 16}px)`;
    const step = p < 0.32 ? 0 : p < 0.7 ? 1 : 2;
    $$('.mix-steps span', bp).forEach((el) => el.classList.toggle('on', Number(el.dataset.step) === step));
  }

  $$('[data-p]', result).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.bottom < -100 || r.top > vh + 100) return;
    el.style.setProperty('--p', still ? 0.5 : clamp((vh - r.top) / (vh + r.height)).toFixed(4));
  });

}

const hero = { on: false };
function heroInit() {
  hero.on = true;
  setTimeout(() => { $('#s-hero')?.classList.add('ready'); onScroll(); }, reduce.matches ? 0 : 1600);
}

result.addEventListener('click', (e) => {
  const hex = e.target.closest('.hexbtn');
  if (hex) {
    const h = hex.dataset.hex || hex.textContent;
    return copy(h, `${h} 복사했어요.`);
  }
  const bar = e.target.closest('.pbar');
  if (bar) {
    $$('.pbar', result).forEach((b) => b.classList.toggle('on', b === bar));
    const h = state.c[bar.dataset.bar];
    return copy(h, `${h} 복사했어요.`);
  }
  const rail = e.target.closest('.rail a');
  if (rail) {
    e.preventDefault();
    $(rail.getAttribute('href')).scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth' });
    return;
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'home' || act === 'edit') {
    if (location.hash) history.replaceState(null, '', baseUrl());
    hero.on = false;
    document.body.dataset.view = 'home';
    result.hidden = true;
    result.innerHTML = '';
    state = null;
    paint(pale(HOME_TINT), 0.5);
    window.scrollTo(0, 0);
    if (act === 'edit') restartAll();
  } else if (act === 'ratio') {
    state.ratio = [...state.base];
    $('#ratio').value = state.ratio[1];
    applyColors();
  } else if (act === 'share') {
    shareLink();
  } else if (act === 'hexes') {
    const { a, b, c } = state;
    copy([
      `${a.name} 상징색 ${c.sa} ${a.sym.ko}`,
      `${b.name} 상징색 ${c.sb} ${b.sym.ko}`,
      `${a.name} 사랑색 ${c.la} ${a.love.ko}`,
      `${b.name} 사랑색 ${c.lb} ${b.love.ko}`,
      `혼합색 ${c.mix} ${state.mix.ko || ''} (${state.ratio[0]}:${state.ratio[1]})`,
    ].join('\n'), '색 코드를 복사했어요.');
  } else if (act === 'save') {
    saveCard();
  }
});

result.addEventListener('input', (e) => {
  if (e.target.id !== 'ratio') return;
  const v = Number(e.target.value);
  state.ratio = [100 - v, v];
  applyColors();
});

result.addEventListener('pointermove', (e) => {
  const card = e.target.closest('#card');
  if (!card || reduce.matches || e.pointerType !== 'mouse') return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--ry', ((e.clientX - r.left) / r.width - 0.5) * 12 + 'deg');
  card.style.setProperty('--rx', ((e.clientY - r.top) / r.height - 0.5) * -12 + 'deg');
});
result.addEventListener('pointerleave', (e) => {
  if (e.target.id !== 'card') return;
  e.target.style.setProperty('--rx', '0deg');
  e.target.style.setProperty('--ry', '0deg');
}, true);

async function saveCard() {
  const { a, b, c } = state;
  try { await document.fonts.ready; } catch {}
  const W = 1080, H = 1520, P = 40;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, W, H);

  const AW = W - P * 2, AH = Math.round(AW * 1.1);
  const art = document.createElement('canvas');
  art.width = AW; art.height = AH;
  const ag = art.getContext('2d');
  const grd = ag.createLinearGradient(AW * 0.2, 0, AW * 0.8, AH);
  const stops = blendStops(c);
  stops.forEach((h, j) => grd.addColorStop(j / (stops.length - 1), h));
  ag.fillStyle = grd;
  ag.fillRect(0, 0, AW, AH);
  g.drawImage(art, P, P);

  g.fillStyle = '#FFFFFF';
  g.shadowColor = 'rgba(42,38,49,.18)';
  g.shadowBlur = 30;
  if (state.pair) {
    g.font = '400 96px "Noto Serif KR", serif';
    fit(g, state.pair, P + 44, P + AH - 160, AW - 88);
    g.font = 'italic 400 52px "Bodoni Moda", "Noto Serif KR", serif';
    fit(g, `${a.name} & ${b.name}`, P + 44, P + AH - 70, AW - 88);
  } else {
    const size = 84;
    const nameFont = `400 ${size}px "Noto Serif KR", serif`;
    const ampFont = `italic 400 ${size * 0.8}px "Bodoni Moda", serif`;
    const gap = size * 0.28;
    g.font = nameFont;
    const wa = g.measureText(a.name).width, wb = g.measureText(b.name).width;
    g.font = ampFont;
    const wm = g.measureText('&').width;
    const total = wa + wb + wm + gap * 2;
    const k = Math.min(1, (AW - 88) / total);
    const y = P + AH - 90;
    g.save();
    g.translate(P + 44, y);
    g.scale(k, k);
    g.font = nameFont;
    g.fillText(a.name, 0, 0);
    g.font = ampFont;
    g.fillText('&', wa + gap, 0);
    g.font = nameFont;
    g.fillText(b.name, wa + gap * 2 + wm, 0);
    g.restore();
  }
  g.shadowBlur = 0;
  g.shadowColor = 'transparent';

  let y = P + AH + 66;
  g.fillStyle = INK;
  g.font = '700 38px "Gothic A1", sans-serif';
  g.fillText('LOVE COLOR', P + 10, y);
  g.font = '400 28px "DM Mono", monospace';
  g.fillText(c.mix, P + 10, y + 46);
  g.font = '400 28px "Gothic A1", sans-serif';
  fit(g, [state.mix.ko || '혼합색', state.mix.en].filter(Boolean).join(' · '), P + 10, y + 90, AW - 20);
  const keys = ['sa', 'la', 'mix', 'lb', 'sb'];
  const bw = AW / 5;
  keys.forEach((k, i) => {
    g.fillStyle = c[k];
    g.fillRect(P + i * bw, y + 128, Math.ceil(bw), 26);
  });

  cv.toBlob((blob) => {
    if (!blob) return toast('이미지를 만들지 못했어요.');
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = `love-color-${c.mix.slice(1).toLowerCase()}.png`;
    document.body.append(el);
    el.click();
    el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('카드 이미지를 저장했어요.');
  }, 'image/png');
}

function fit(g, text, x, y, max) {
  const m = g.measureText(text).width;
  if (m <= max) return g.fillText(text, x, y);
  g.save();
  g.translate(x, y);
  g.scale(max / m, 1);
  g.fillText(text, 0, 0);
  g.restore();
}
