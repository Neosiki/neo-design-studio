#!/usr/bin/env node
/**
 * webtoon-studio.mjs · 웹툰·4컷 콘티 검사, 이미지 프롬프트 2안, 말풍선 합성, 세로 스크롤 내보내기
 *
 * 컷 그림은 세 가지 경로 중 하나로 마련한다.
 *   1) Claude가 SVG로 직접 그린다(`art-init`로 뼈대를 만들고 채운 뒤 `compose`가 PNG로 렌더한다). 도구·계정이 필요 없다.
 *   2) 외부 도구(ChatGPT·Gemini 등)로 만든 파일을 `image`에 연결한다(`prompts`가 컷별 프롬프트 2안을 만든다).
 *   3) 사용자가 가진 그림·사진을 `image`에 연결한다.
 * 어느 경로든 말풍선·효과음·해설 박스·로고를 올려 4컷 그리드나 세로 스크롤 이미지로 묶어 낸다.
 * 컷 그림이 아직 없으면 정직한 자리표시(placeholder)로 두고 경고한다.
 *
 * 사용법 (저장소 루트 기준):
 *   node skills/webtoon-studio/scripts/webtoon-studio.mjs init    --kind four-cut|episode|store-menu|store-event|store-review --out spec.json
 *   node skills/webtoon-studio/scripts/webtoon-studio.mjs check   --spec spec.json
 *   node skills/webtoon-studio/scripts/webtoon-studio.mjs prompts --spec spec.json --out prompts.md
 *   node skills/webtoon-studio/scripts/webtoon-studio.mjs art-size --spec spec.json            (컷별 권장 SVG 캔버스 크기)
 *   node skills/webtoon-studio/scripts/webtoon-studio.mjs art-init --spec spec.json --out-dir art [--link]   (컷별 SVG 뼈대, --link는 spec에 art 경로를 적음)
 *   node skills/webtoon-studio/scripts/webtoon-studio.mjs art     --spec spec.json --out-dir _art [--guides]  (SVG를 PNG로 미리 렌더, --guides는 말풍선 자리 표시)
 *   node skills/webtoon-studio/scripts/webtoon-studio.mjs compose --spec spec.json --out-dir _webtoon [--scale 1] [--allow-placeholder] [--guides]
 *
 * init·check·prompts·art-size·art-init은 브라우저 없이 돌고, art·compose만 Playwright(Chromium)가 필요하다.
 * 이미지 경로는 spec 파일이 있는 폴더 기준 상대 경로다. 형식 설명은 references/webtoon-recipes.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const BUBBLE_TYPES = ['say', 'think', 'shout', 'narration', 'review'];
const TAILS = ['bl', 'br', 'tl', 'tr', 'none'];

/* ───────────────────────── 시작 spec ───────────────────────── */

const P = (id, scene, shot, extra = {}) => ({ id, scene, shot, mood: '', characters: [], image: null, ratio: 1, bubbles: [], sfx: [], ...extra });

export const STARTERS = {
  'four-cut': () => ({
    title: '4컷 제목', kind: 'four-cut', format: '1x1',
    style: '화풍 한 줄 (예: 굵은 선, 따뜻한 수채 톤, 단순한 배경)',
    characters: [{ name: '주인공', anchor: '외형 고정 문장: 나이대·머리·옷·소품을 구체적으로, 매 컷 프롬프트 맨 앞에 그대로 붙는다' }],
    palette: { paper: '#FFFDF7', ink: '#1B1B1B', accent: '#E8A33D', main: '#C8553D' },
    panels: [
      P('c1', '상황 제시', '중간 샷', { characters: ['주인공'], bubbles: [{ type: 'say', text: '대사를 짧게', x: 0.08, y: 0.06, w: 0.55, tail: 'bl' }] }),
      P('c2', '전개', '클로즈업', { characters: ['주인공'] }),
      P('c3', '전환', '넓은 샷', { characters: ['주인공'] }),
      P('c4', '마무리', '중간 샷', { characters: ['주인공'] }),
    ],
  }),
  episode: () => ({
    title: '회차 제목', kind: 'episode', width: 800, gap: 28, pageMaxHeight: 1280,
    style: '화풍 한 줄', characters: [{ name: '주인공', anchor: '외형 고정 문장' }],
    palette: { paper: '#FFFFFF', ink: '#1B1B1B', accent: '#E8A33D', main: '#C8553D' },
    panels: Array.from({ length: 10 }, (_, i) => P(`c${i + 1}`, `장면 ${i + 1}`, i === 0 ? '넓은 샷(훅)' : '중간 샷', { characters: ['주인공'], ratio: i === 0 ? 1.2 : 1 })),
  }),
  'store-menu': () => storeStarter('메뉴 소개', [
    ['공감', '손님이 겪는 상황·고민 한 장면', '중간 샷'],
    ['발견', '메뉴가 등장하는 장면', '클로즈업'],
    ['포인트', '재료·조리 방식 (대표 확인 사실만)', '클로즈업'],
    ['안내', '매장 위치·영업시간·주문 방법 (대표 확인 자료)', '중간 샷'],
  ]),
  'store-event': () => storeStarter('이벤트 안내', [
    ['일상', '평소 매장 풍경', '넓은 샷'],
    ['소식', '이벤트 소식을 전하는 장면', '중간 샷'],
    ['조건', '기간·조건·혜택 (대표 확인 자료)', '클로즈업'],
    ['안내', '참여 방법과 매장 안내', '중간 샷'],
  ]),
  'store-review': () => storeStarter('후기 소개', [
    ['방문', '손님이 매장에 들어오는 장면', '넓은 샷'],
    ['선택', '메뉴를 고르는 장면', '중간 샷'],
    ['반응', '실제 후기를 소개하는 장면 (후기 원문과 출처 필수)', '클로즈업'],
    ['마무리', '감사 인사와 매장 안내', '중간 샷'],
  ]),
};

function storeStarter(title, rows) {
  const s = STARTERS['four-cut']();
  s.title = `[매장명] ${title}`;
  s.format = '4x5';
  s.footer = '매장명 · 주소 · 영업시간 (대표 확인 자료로 교체)';
  s.characters = [{ name: '사장님', anchor: '외형 고정 문장 (실제 인물을 닮게 그리지 않는다)' }, { name: '손님', anchor: '외형 고정 문장' }];
  s.panels = rows.map(([label, scene, shot], i) => P(`c${i + 1}`, `${label}: ${scene}`, shot, { characters: ['사장님'] }));
  if (title === '후기 소개') {
    s.panels[2].bubbles = [{ type: 'review', text: '실제 후기 원문을 그대로', source: '출처: 네이버 리뷰 2026.00.00 (원문 그대로)', x: 0.06, y: 0.06, w: 0.88 }];
  }
  return s;
}

/* ───────────────────────── 공통 ───────────────────────── */

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--allow-placeholder') a.allowPlaceholder = true;
    else if (t === '--guides') a.guides = true;
    else if (t === '--link') a.link = true;
    else if (t.startsWith('--')) {
      if (i + 1 >= argv.length) throw new Error(`${t} 뒤에 값이 필요합니다`);
      a[t.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    } else a._.push(t);
  }
  return a;
}

function loadSpec(file) {
  if (!file) throw new Error('--spec 파일을 지정하세요');
  const abs = path.resolve(file);
  const spec = JSON.parse(fs.readFileSync(abs, 'utf8'));
  spec._dir = path.dirname(abs);
  return spec;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const html = (s) => esc(s).replace(/\n/g, '<br>');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 말풍선 위치가 없으면 컷 안에서 위에서 아래로 번갈아 배치 */
function bubblesOf(p) {
  const list = p.bubbles || [];
  return list.map((b, i) => ({
    type: 'say', tail: 'bl', ...b,
    x: b.x ?? (i % 2 === 0 ? 0.06 : 0.42),
    y: b.y ?? clamp(0.05 + i * 0.28, 0, 0.85),
    w: b.w ?? 0.52,
  }));
}

function layoutOf(spec) {
  const kind = spec.kind || 'four-cut';
  if (kind === 'episode') return { mode: 'scroll', width: spec.width || 800 };
  const f = spec.format || '1x1';
  if (f === 'strip') return { mode: 'scroll', width: spec.width || 1080 };
  if (f === '4x5') return { mode: 'grid', w: 1080, h: 1350 };
  return { mode: 'grid', w: 1080, h: 1080 };
}

/** 컷 비율(가로:세로) 문자열. 그리드는 칸 크기, 스크롤은 ratio */
function panelAspect(spec, p, lay) {
  if (lay.mode === 'grid') {
    const g = gridGeom(spec, lay);
    return { w: g.cw, h: g.ch };
  }
  const r = clamp(p.ratio ?? 1, 0.3, 2.4);
  return { w: 1000, h: Math.round(1000 * r) };
}

function gridGeom(spec, lay) {
  const margin = 40, gap = 20;
  const head = spec.title && spec.showTitle !== false ? 110 : 0;
  const foot = spec.footer ? 70 : 0;
  const cw = Math.floor((lay.w - margin * 2 - gap) / 2);
  const ch = Math.floor((lay.h - margin * 2 - gap - head - foot) / 2);
  return { margin, gap, head, foot, cw, ch };
}

const STD = [[1, 1, '1:1'], [4, 5, '4:5'], [3, 4, '3:4'], [2, 3, '2:3'], [9, 16, '9:16'], [5, 4, '5:4'], [4, 3, '4:3'], [3, 2, '3:2'], [16, 9, '16:9']];
function ratioText(w, h) {
  const r = w / h;
  const hit = STD.find(([a, b]) => Math.abs(r / (a / b) - 1) < 0.04);
  return hit ? hit[2] : `${r.toFixed(2)}:1`;
}

/* ───────────────────────── check ───────────────────────── */

export function check(spec) {
  const errors = [], warnings = [], facts = [];
  const lay = layoutOf(spec);
  const n = (spec.panels || []).length;
  const kind = spec.kind || 'four-cut';
  if (!n) errors.push('panels가 비어 있습니다');
  if (kind === 'four-cut' && n && n !== 4) errors.push(`4컷 형식은 컷이 정확히 4개여야 합니다(현재 ${n}개)`);
  if (kind === 'episode' && n && (n < 10 || n > 30)) warnings.push(`에피소드형은 보통 10~30컷입니다(현재 ${n}개)`);
  const names = new Set((spec.characters || []).map((c) => c.name));
  const ids = new Set();
  const textLimit = lay.mode === 'grid' ? 28 : 40;
  (spec.panels || []).forEach((p, i) => {
    const tag = `컷 ${i + 1}(${p.id || '-'})`;
    if (!p.id) errors.push(`${tag}: id가 없습니다`);
    else if (ids.has(p.id)) errors.push(`${tag}: id가 중복입니다`);
    ids.add(p.id);
    if (!p.scene) warnings.push(`${tag}: scene(장면 설명)이 없어 프롬프트가 빈약해집니다`);
    (p.characters || []).forEach((c) => { if (!names.has(c)) errors.push(`${tag}: 캐릭터 「${c}」가 characters에 없습니다`); });
    if (p.ratio != null && (p.ratio < 0.3 || p.ratio > 2.4)) warnings.push(`${tag}: ratio ${p.ratio}는 0.3~2.4 밖이라 보정됩니다`);
    const bs = bubblesOf(p);
    if (bs.length > 3) warnings.push(`${tag}: 말풍선 ${bs.length}개 — 한 컷에는 3개 이하가 읽기 좋습니다`);
    let prev = null;
    bs.forEach((b, j) => {
      if (!BUBBLE_TYPES.includes(b.type)) errors.push(`${tag} 말풍선 ${j + 1}: type은 ${BUBBLE_TYPES.join('/')} 중 하나`);
      if (!TAILS.includes(b.tail)) errors.push(`${tag} 말풍선 ${j + 1}: tail은 ${TAILS.join('/')} 중 하나`);
      const len = [...String(b.text || '').replace(/\s/g, '')].length;
      if (!b.text) errors.push(`${tag} 말풍선 ${j + 1}: text가 비어 있습니다`);
      if (len > textLimit) warnings.push(`${tag} 말풍선 ${j + 1}: ${len}자(공백 제외) — ${textLimit}자 이하로 줄이세요`);
      if (b.type === 'review' && !b.source) errors.push(`${tag} 말풍선 ${j + 1}: 후기(review)는 source(출처)가 필수입니다. 후기는 지어내지 않습니다`);
      if (b.x < 0 || b.y < 0 || b.x + b.w > 1.001) warnings.push(`${tag} 말풍선 ${j + 1}: 위치·폭이 컷 밖으로 나갑니다`);
      if (prev && (b.y < prev.y - 0.1 || (Math.abs(b.y - prev.y) <= 0.1 && b.x < prev.x - 0.1))) {
        warnings.push(`${tag} 말풍선 ${j + 1}: 읽는 순서(위→아래, 왼→오른쪽)와 배열 순서가 다릅니다`);
      }
      prev = b;
      const t = `${b.text || ''} ${b.source || ''}`;
      if (/\d[\d,.]*\s*(원|%|퍼센트|시|분|월|일|개|명|kg|g|ml|cm|km|m)/.test(t) || /\d{1,3}(,\d{3})+|\d{3,}/.test(t)) facts.push(`${tag}: 「${String(b.text).replace(/\n/g, ' ')}」`);
    });
    (p.sfx || []).forEach((s, j) => { if (!s.text) errors.push(`${tag} 효과음 ${j + 1}: text가 비어 있습니다`); });
    const cap = p.caption || '';
    if (/\d/.test(cap)) facts.push(`${tag}: 해설 「${cap.replace(/\n/g, ' ')}」`);
    if (p.image) {
      const f = path.resolve(spec._dir || '.', p.image);
      if (!fs.existsSync(f)) warnings.push(`${tag}: 이미지 파일이 없습니다(${p.image}) — 자리표시로 처리됩니다`);
      if (p.art) warnings.push(`${tag}: image와 art가 모두 있어 image를 씁니다`);
    } else if (p.art) {
      const f = path.resolve(spec._dir || '.', p.art);
      if (!fs.existsSync(f)) warnings.push(`${tag}: art 파일이 없습니다(${p.art}) — 자리표시로 처리됩니다`);
      else {
        const t = fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
        if (!/<svg[\s>]/.test(t)) errors.push(`${tag}: art 파일이 SVG가 아닙니다(${p.art})`);
        if (/<text[\s>]/.test(t) && !/data-allow-text/.test(t)) warnings.push(`${tag}: 그림 SVG 안에 <text>가 있습니다 — 글자는 말풍선·해설로 올리세요(소품 글자는 svg 태그에 data-allow-text를 붙이면 통과)`);
      }
    } else warnings.push(`${tag}: image·art가 비어 있어 자리표시로 처리됩니다`);
    (p.overlays || []).forEach((o, j) => {
      if (!o.image || !fs.existsSync(path.resolve(spec._dir || '.', o.image))) warnings.push(`${tag} 오버레이 ${j + 1}: 파일이 없습니다`);
    });
  });
  if (lay.mode === 'scroll' && (spec.panels || []).length) {
    const total = spec.panels.reduce((s, p) => s + lay.width * clamp(p.ratio ?? 1, 0.3, 2.4), 0);
    if (total > 30000) warnings.push(`전체 길이가 약 ${Math.round(total)}px — 플랫폼 업로드 한도를 확인하세요`);
  }
  return { errors, warnings, facts };
}

/* ───────────────────────── prompts ───────────────────────── */

function zoneText(bs) {
  if (!bs.length) return '말풍선이 없으므로 구도 제한 없음';
  const zs = bs.map((b) => {
    const cy = b.y + 0.1, cx = b.x + b.w / 2;
    const v = cy < 0.34 ? '상단' : cy > 0.66 ? '하단' : '가운데';
    const h = cx < 0.4 ? '왼쪽' : cx > 0.6 ? '오른쪽' : '중앙';
    return `${v} ${h}`;
  });
  return `${[...new Set(zs)].join(', ')} 영역은 말풍선 자리이므로 얼굴·손·핵심 소품을 두지 말고 배경을 단순하게 비워 둔다`;
}

export function buildPrompts(spec) {
  const lay = layoutOf(spec);
  const chars = Object.fromEntries((spec.characters || []).map((c) => [c.name, c.anchor]));
  const out = [];
  out.push(`# ${spec.title || '웹툰'} · 컷별 이미지 프롬프트 2안\n`);
  out.push('사용법: 컷마다 A안(안정형)과 B안(변주형)을 모두 생성해 더 나은 쪽을 고른다. 생성 도구는 자유다. 모든 프롬프트 맨 앞의 캐릭터 문장은 한 글자도 바꾸지 않는다.\n');
  out.push(`- 화풍: ${spec.style || '(미정)'}`);
  out.push('- 공통 금지: 그림 안에 글자·말풍선·효과음·로고·간판 문구를 그리지 않는다(글자는 합성 단계에서 올린다). 실존 인물·실존 캐릭터·특정 브랜드를 닮게 그리지 않는다.\n');
  (spec.panels || []).forEach((p, i) => {
    const a = panelAspect(spec, p, lay);
    const bs = bubblesOf(p);
    const who = (p.characters || []).map((c) => `${c}: ${chars[c] || '(anchor 없음)'}`).join('\n   ');
    const base = [
      who ? `[캐릭터]\n   ${who}` : '',
      `[장면] ${p.scene || ''}`,
      p.mood ? `[분위기] ${p.mood}` : '',
      `[화풍] ${spec.style || ''}`,
      `[화면비] 가로:세로 = ${ratioText(a.w, a.h)}`,
      `[여백] ${zoneText(bs)}`,
      '[금지] 그림 안에 어떤 글자도 넣지 않는다',
    ].filter(Boolean).join('\n');
    out.push(`## 컷 ${i + 1} · ${p.id}\n`);
    out.push('**A안 · 안정형** — 읽기 쉬운 눈높이 구도\n```text');
    out.push(`${base}\n[구도] ${p.shot || '중간 샷'}, 눈높이 앵글, 인물은 화면 중앙 3분의 2 안, 배경은 장면을 이해할 만큼만 단순하게`);
    out.push('```\n');
    out.push('**B안 · 변주형** — 같은 장면, 다른 연출\n```text');
    out.push(`${base}\n[구도] ${variantShot(p.shot, i)}, 감정의 방향이 한눈에 보이게 표정과 손동작을 키운다`);
    out.push('```\n');
  });
  out.push('## 생성 후 확인\n');
  out.push('- 같은 인물이 컷마다 같은 얼굴·머리·옷으로 보이는가(다르면 해당 컷만 다시 생성)\n- 그림 안에 글자나 로고가 들어가 있지 않은가\n- 말풍선 자리가 실제로 비어 있는가\n- 손가락·소품·간판 같은 세부가 깨지지 않았는가\n- 파일을 spec의 panels[].image 경로에 넣고 `check` → `compose` 순서로 진행한다');
  return out.join('\n');
}

function variantShot(shot = '', i) {
  if (/클로즈|close/i.test(shot)) return '한 단계 물러난 중간 샷, 약간 높은 앵글';
  if (/넓|wide|롱/i.test(shot)) return '인물을 키운 중간 샷, 약간 낮은 앵글';
  return i % 2 === 0 ? '가까운 클로즈업, 약간 비스듬한 앵글' : '약간 높은 앵글에서 내려다본 넓은 샷';
}

/* ───────────────────────── compose ───────────────────────── */

function fileUrl(spec, p) { return pathToFileURL(path.resolve(spec._dir || '.', p)).href; }

function bubbleHtml(b, fs_) {
  const t = b.type;
  const style = `left:${(b.x * 100).toFixed(2)}%;top:${(b.y * 100).toFixed(2)}%;width:${(b.w * 100).toFixed(2)}%;font-size:${fs_}px;`;
  if (t === 'shout') return `<div class="b shout" data-bubble style="${style}"><div class="shape"><span>${html(b.text)}</span></div></div>`;
  if (t === 'narration') return `<div class="b narr" data-bubble style="${style}"><span>${html(b.text)}</span></div>`;
  if (t === 'review') return `<div class="b review" data-bubble style="${style}"><span>「${html(b.text)}」</span><em>${html(b.source)}</em></div>`;
  const tail = b.tail && b.tail !== 'none' ? `<i class="tail t-${b.tail}"></i>` : '';
  const dots = t === 'think' && b.tail && b.tail !== 'none' ? `<i class="dot d1 t-${b.tail}"></i><i class="dot d2 t-${b.tail}"></i>` : '';
  return `<div class="b ${t}" data-bubble style="${style}"><span>${html(b.text)}</span>${t === 'think' ? dots : tail}</div>`;
}

function panelHtml(spec, p, idx, w, h, fsRatio) {
  const fsPx = Math.round(w * fsRatio);
  const img = p.image && fs.existsSync(path.resolve(spec._dir || '.', p.image))
    ? `<img class="art" data-art src="${fileUrl(spec, p.image)}" alt="">`
    : `<div class="ph" data-ph><b>컷 ${idx + 1} · 이미지 필요</b><small>${esc(p.scene || '')}</small></div>`;
  const cap = p.caption ? `<div class="b narr cap" data-bubble style="left:2%;top:2%;width:96%;font-size:${fsPx}px"><span>${html(p.caption)}</span></div>` : '';
  const bs = bubblesOf(p).map((b) => bubbleHtml(b, fsPx)).join('');
  const sfx = (p.sfx || []).map((s) => `<div class="sfx" data-bubble style="left:${((s.x ?? 0.5) * 100).toFixed(1)}%;top:${((s.y ?? 0.5) * 100).toFixed(1)}%;font-size:${Math.round(w * (s.size ?? 0.12))}px;transform:translate(-50%,-50%) rotate(${s.rot ?? -6}deg);color:${esc(s.color || 'var(--accent)')}">${html(s.text)}</div>`).join('');
  const ov = (p.overlays || []).map((o) => `<img class="ov" src="${fileUrl(spec, o.image)}" style="left:${((o.x ?? 0.7) * 100).toFixed(1)}%;top:${((o.y ?? 0.75) * 100).toFixed(1)}%;width:${((o.w ?? 0.25) * 100).toFixed(1)}%" alt="">`).join('');
  return `<section class="panel" data-panel="${esc(p.id)}" style="width:${w}px;height:${h}px">${img}${ov}${cap}${bs}${sfx}</section>`;
}

const CSS = (spec, pal) => `
@font-face{font-family:"WT";src:${spec.fontFile ? `url("${fileUrl(spec, spec.fontFile)}")` : 'local("Noto Sans CJK KR"),local("Noto Sans KR"),local("Malgun Gothic"),local("Apple SD Gothic Neo")'}}
:root{--paper:${pal.paper};--ink:${pal.ink};--accent:${pal.accent}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--paper)}
body{font-family:"WT","${spec.font || 'Noto Sans CJK KR'}","Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
.panel{position:relative;overflow:hidden;background:#ddd;border:3px solid var(--ink)}
.art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ph{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6em;text-align:center;padding:8%;color:#555;background:repeating-linear-gradient(45deg,#e6e6e6 0 14px,#dcdcdc 14px 28px)}
.ph b{font-size:1.5em}.ph small{font-size:1em;opacity:.8;line-height:1.4}
.ov{position:absolute;height:auto}
.b{position:absolute;line-height:1.35;font-weight:700;word-break:keep-all;overflow-wrap:anywhere;text-align:center}
.b span{display:block}
.say,.think{background:#fff;border:3px solid var(--ink);border-radius:50% / 46%;padding:.7em 1em}
.think{border-style:dashed}
.tail{position:absolute;width:.8em;height:.8em;background:#fff}
.t-bl{left:22%;bottom:-.42em;border-right:3px solid var(--ink);border-bottom:3px solid var(--ink);transform:rotate(45deg) skew(12deg,12deg)}
.t-br{right:22%;bottom:-.42em;border-right:3px solid var(--ink);border-bottom:3px solid var(--ink);transform:rotate(45deg) skew(-12deg,-12deg)}
.t-tl{left:22%;top:-.42em;border-left:3px solid var(--ink);border-top:3px solid var(--ink);transform:rotate(45deg) skew(12deg,12deg)}
.t-tr{right:22%;top:-.42em;border-left:3px solid var(--ink);border-top:3px solid var(--ink);transform:rotate(45deg) skew(-12deg,-12deg)}
.dot{position:absolute;background:#fff;border:3px solid var(--ink);border-radius:50%}
.d1{width:.55em;height:.55em}.d2{width:.3em;height:.3em}
.dot.t-bl,.dot.t-br,.dot.t-tl,.dot.t-tr{transform:none}
.d1.t-bl{left:18%;bottom:-.95em}.d2.t-bl{left:12%;bottom:-1.4em}
.d1.t-br{right:18%;bottom:-.95em}.d2.t-br{right:12%;bottom:-1.4em}
.d1.t-tl{left:18%;top:-.95em}.d2.t-tl{left:12%;top:-1.4em}
.d1.t-tr{right:18%;top:-.95em}.d2.t-tr{right:12%;top:-1.4em}
.shout{filter:drop-shadow(3px 0 0 var(--ink)) drop-shadow(-3px 0 0 var(--ink)) drop-shadow(0 3px 0 var(--ink)) drop-shadow(0 -3px 0 var(--ink));font-size:1.12em}
.shout .shape{background:var(--accent);padding:1em 1.2em;clip-path:polygon(0 12%,8% 0,18% 10%,30% 0,42% 9%,55% 0,67% 10%,80% 0,90% 9%,100% 14%,94% 32%,100% 48%,93% 64%,100% 82%,90% 92%,80% 100%,66% 91%,54% 100%,42% 91%,30% 100%,18% 91%,8% 100%,0 86%,6% 68%,0 50%,7% 33%)}
.narr{background:#FFF6D6;border:3px solid var(--ink);padding:.55em .8em;text-align:left;font-weight:600}
.cap{position:absolute}
.review{background:#fff;border:3px solid var(--ink);padding:.7em .9em;text-align:left}
.review em{display:block;margin-top:.5em;font-size:.7em;font-style:normal;font-weight:500;opacity:.75}
.sfx{position:absolute;font-weight:900;line-height:1;white-space:nowrap;-webkit-text-stroke:.08em var(--ink);paint-order:stroke fill;letter-spacing:-.02em}
.title{display:flex;align-items:center;justify-content:center;text-align:center;font-weight:800;padding:0 4%;line-height:1.25}
.foot{display:flex;align-items:center;justify-content:center;text-align:center;font-weight:600;opacity:.85}
.grid{display:grid;position:relative}
`;

function buildHtml(spec) {
  const lay = layoutOf(spec);
  const pal = { paper: '#FFFFFF', ink: '#1B1B1B', accent: '#E8A33D', ...(spec.palette || {}) };
  const panels = spec.panels || [];
  let body = '', size = {};
  if (lay.mode === 'grid') {
    const g = gridGeom(spec, lay);
    const fsRatio = spec.fontScale ?? 0.075;
    const cells = panels.map((p, i) => panelHtml(spec, p, i, g.cw, g.ch, fsRatio)).join('');
    const titleBlock = g.head ? `<div class="title" data-block="title" style="height:${g.head}px;font-size:${Math.round(g.head * 0.42)}px">${html(spec.title)}</div>` : '';
    const footBlock = g.foot ? `<div class="foot" data-block="foot" style="height:${g.foot}px;font-size:${Math.round(g.foot * 0.36)}px">${html(spec.footer)}</div>` : '';
    body = `<main id="root" style="width:${lay.w}px;height:${lay.h}px;padding:${g.margin}px;background:var(--paper)">${titleBlock}<div class="grid" style="grid-template-columns:${g.cw}px ${g.cw}px;gap:${g.gap}px;margin-top:${g.head ? 0 : 0}px">${cells}</div>${footBlock}</main>`;
    size = { w: lay.w, h: lay.h };
  } else {
    const W = lay.width, gap = spec.gap ?? 24;
    const fsRatio = spec.fontScale ?? 0.045;
    const cells = panels.map((p, i) => panelHtml(spec, p, i, W, Math.round(W * clamp(p.ratio ?? 1, 0.3, 2.4)), fsRatio)).join(`<div data-gap style="height:${gap}px"></div>`);
    const head = spec.title && spec.showTitle !== false ? `<div class="title" data-block="title" style="height:${Math.round(W * 0.2)}px;font-size:${Math.round(W * 0.06)}px">${html(spec.title)}</div>` : '';
    const foot = spec.footer ? `<div class="foot" data-block="foot" style="height:${Math.round(W * 0.14)}px;font-size:${Math.round(W * 0.036)}px">${html(spec.footer)}</div>` : '';
    body = `<main id="root" style="width:${W}px;background:var(--paper)">${head}${cells}${foot}</main>`;
    size = { w: W };
  }
  return { html: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(spec.title || 'webtoon')}</title><style>${CSS(spec, pal)}</style></head><body>${body}</body></html>`, lay, size };
}

/* ───────────────────────── art (Claude가 직접 그리는 컷 그림) ───────────────────────── */

const hex = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim()); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [128, 128, 128]; };
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

/** 컷 그림 SVG의 권장 캔버스 크기. 합성 칸 크기의 2배(그리드) 또는 스크롤 너비의 1.5배 */
export function artSize(spec, p) {
  const lay = layoutOf(spec);
  if (lay.mode === 'grid') { const g = gridGeom(spec, lay); return { w: g.cw * 2, h: g.ch * 2 }; }
  const w = Math.round(lay.width * 1.5);
  return { w, h: Math.round(w * clamp(p.ratio ?? 1, 0.3, 2.4)) };
}

/**
 * 컷 그림 SVG에 자동으로 넣어 주는 공용 정의. id는 모두 wt- 접두어라 작가 SVG의 id와 겹치지 않는다.
 * 그라데이션: wt-g-main(캐릭터 주색) wt-g-accent wt-g-paper(밝은 사물) wt-g-bg(배경, 위→아래)
 * 필터: wt-b6 wt-b14 wt-b28(번짐 그림자·빛), 얼굴: wt-face-sleepy|happy|wide|smile (두 눈 사이가 원점), wt-blush
 */
export function styleDefs(spec, style = 'clay') {
  const pal = { paper: '#FFFDF7', ink: '#1B1B1B', accent: '#E8A33D', ...(spec.palette || {}) };
  pal.main = spec.palette?.main || pal.accent;
  const flat = style === 'flat';
  const radial = (id, c) => `<radialGradient id="${id}" cx=".33" cy=".22" r=".95"><stop offset="0" stop-color="${flat ? c : mix(c, '#ffffff', 0.3)}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${flat ? c : mix(c, '#000000', 0.4)}"/></radialGradient>`;
  const linear = (id, c) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${flat ? c : mix(c, '#ffffff', 0.25)}"/><stop offset="1" stop-color="${flat ? c : mix(c, '#000000', 0.08)}"/></linearGradient>`;
  const k = '#1B0A0B'; // 얼굴 선 색은 고정. 몸 주색(palette.main)은 이보다 밝게 둔다
  const eyes = (fn) => `${fn(-82)}${fn(82)}`;
  const arc = (x, y0, y1, w = 9) => `<path d="M ${x - 24} ${y0} Q ${x} ${y1} ${x + 24} ${y0}" fill="none" stroke="${k}" stroke-width="${w}" stroke-linecap="round"/>`;
  const faces = {
    sleepy: `${eyes((x) => arc(x, -2, 16))}<path d="M -16 54 Q 0 62 16 54" fill="none" stroke="${k}" stroke-width="8" stroke-linecap="round"/>`,
    happy: `${eyes((x) => arc(x, 10, -18))}<path d="M -48 36 Q 0 88 48 36 Z" fill="#3A0A10" stroke="${k}" stroke-width="7" stroke-linejoin="round"/><ellipse cx="0" cy="62" rx="22" ry="12" fill="#E8828B"/>`,
    wide: `${eyes((x) => `<ellipse cx="${x}" cy="0" rx="17" ry="23" fill="${k}"/><circle cx="${x + 5}" cy="-9" r="6" fill="#fff"/>`)}<ellipse cx="0" cy="58" rx="20" ry="26" fill="#3A0A10"/><ellipse cx="0" cy="70" rx="12" ry="9" fill="#E8828B"/>`,
    smile: `${eyes((x) => `<path d="M ${x - 24} 0 Q ${x} -10 ${x + 24} 0 Q ${x} 10 ${x - 24} 0Z" fill="${k}"/><circle cx="${x + 7}" cy="-1" r="4" fill="#fff"/>`)}<path d="M -40 38 Q 0 76 40 38" fill="none" stroke="${k}" stroke-width="9" stroke-linecap="round"/>`,
  };
  return `<defs data-wt="${style}">
${radial('wt-g-main', pal.main)}${radial('wt-g-accent', pal.accent)}${radial('wt-g-paper', pal.paper)}${linear('wt-g-bg', mix(pal.paper, pal.accent, 0.12))}
<filter id="wt-b6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="wt-b14" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
<filter id="wt-b28" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>
${Object.entries(faces).map(([n, g]) => `<g id="wt-face-${n}">${g}</g>`).join('\n')}
<g id="wt-blush"><ellipse cx="-138" cy="46" rx="34" ry="25" fill="#EC98A2" opacity=".95"/><ellipse cx="138" cy="46" rx="34" ry="25" fill="#EC98A2" opacity=".95"/></g>
</defs>`;
}

/** 작가 SVG에 공용 정의를 넣고(없을 때만), 말풍선 안내 그룹은 지운다 */
function prepareSvg(svg, spec, { guides = false } = {}) {
  let out = svg;
  if (!guides) out = out.replace(/<g id="safe-guides"[\s\S]*?<\/g>\s*/, '');
  if (!/data-wt=/.test(out)) out = out.replace(/<svg[^>]*>/, (m) => `${m}${styleDefs(spec, spec.artStyle || 'clay')}`);
  return out;
}

export function artSkeleton(spec, p) {
  const { w, h } = artSize(spec, p);
  const chars = Object.fromEntries((spec.characters || []).map((c) => [c.name, c.anchor]));
  const who = (p.characters || []).map((c) => `  ${c}: ${chars[c] || ''}`).join('\n');
  const guides = bubblesOf(p).map((b) => `<rect x="${Math.round(b.x * w)}" y="${Math.round(b.y * h)}" width="${Math.round(b.w * w)}" height="${Math.round(h * 0.2)}" fill="none" stroke="#FF3B30" stroke-width="4" stroke-dasharray="14 10"/>`).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<!--
컷 ${p.id} · ${p.scene || ''}
구도: ${p.shot || '중간 샷'}   분위기: ${p.mood || ''}
캐릭터:
${who}
캔버스 ${w}×${h}. 공용 정의(자동 삽입): 그라데이션 wt-g-main wt-g-accent wt-g-paper wt-g-bg, 번짐 wt-b6 wt-b14 wt-b28, 얼굴 wt-face-sleepy|happy|wide|smile, 볼터치 wt-blush.
규칙: 글자(<text>)를 넣지 않는다. 말풍선 자리(빨간 점선, 렌더 때 사라짐)는 비워 둔다. 층 순서: 배경 → 바닥·사물 → 캐릭터 → 앞 사물 → 김·빛.
캐릭터 예시(둥근 몸 + 얼굴 + 볼터치):
<g transform="translate(${Math.round(w / 2)} ${Math.round(h * 0.6)})">
  <ellipse cx="0" cy="190" rx="260" ry="30" fill="#000" opacity=".2" filter="url(#wt-b14)"/>
  <path d="M -240 -30 C -252 125 -150 188 0 188 C 150 188 252 125 240 -30 C 232 -92 120 -116 0 -116 C -120 -116 -232 -92 -240 -30 Z" fill="url(#wt-g-main)"/>
  <use href="#wt-face-smile" transform="translate(0 30)"/><use href="#wt-blush" transform="translate(0 30)"/>
</g>
-->
<g id="bg"><rect width="${w}" height="${h}" fill="url(#wt-g-bg)"/></g>
<g id="props"></g>
<g id="characters"></g>
<g id="front"></g>
<g id="safe-guides">
  ${guides}
</g>
</svg>
`;
}

/** art 필드가 있고 image가 비어 있는 컷의 SVG를 PNG로 렌더한다. 반환: { map: {컷id: PNG 절대 경로}, warnings } */
async function renderArts(browser, spec, outDir, opts = {}) {
  const map = {}, warnings = [];
  const todo = (spec.panels || []).filter((p) => p.art && !p.image);
  if (!todo.length) return { map, warnings };
  const dir = path.join(outDir, 'art');
  fs.mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  try {
    for (const p of todo) {
      const f = path.resolve(spec._dir || '.', p.art);
      if (!fs.existsSync(f)) continue;
      const svg = prepareSvg(fs.readFileSync(f, 'utf8'), spec, opts);
      const want = artSize(spec, p);
      const mw = /<svg[^>]*\swidth="(\d+(?:\.\d+)?)"/.exec(svg), mh = /<svg[^>]*\sheight="(\d+(?:\.\d+)?)"/.exec(svg);
      const w = mw ? Math.round(+mw[1]) : want.w, h = mh ? Math.round(+mh[1]) : want.h;
      if (Math.abs(w / h / (want.w / want.h) - 1) > 0.08) warnings.push(`컷 ${p.id}: 그림 SVG 비율 ${(w / h).toFixed(2)} ↔ 컷 비율 ${(want.w / want.h).toFixed(2)} — 가장자리가 잘립니다(권장 ${want.w}×${want.h})`);
      await page.setViewportSize({ width: w, height: h });
      await page.setContent(`<html><body style="margin:0;background:#fff">${svg}</body></html>`);
      const out = path.join(dir, `${p.id}.png`);
      await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
      map[p.id] = out;
    }
  } finally { await page.close(); }
  return { map, warnings };
}

export async function compose(spec0, outDir, opts = {}) {
  const check_ = check(spec0);
  if (check_.errors.length) throw new Error(`spec 오류 ${check_.errors.length}건:\n- ${check_.errors.join('\n- ')}`);
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { throw new Error('Playwright가 없습니다. `npm i playwright` 후 `npx playwright install chromium` 을 실행하세요.'); }
  fs.mkdirSync(outDir, { recursive: true });
  const scale = Number(opts.scale || 1);
  const browser = await chromium.launch();
  const warnings = [...check_.warnings];
  const files = [];
  let spec = spec0, missing = [], built;
  try {
    const arts = await renderArts(browser, spec0, outDir, { guides: opts.guides });
    warnings.push(...arts.warnings);
    spec = { ...spec0, panels: (spec0.panels || []).map((p) => (arts.map[p.id] ? { ...p, image: arts.map[p.id] } : p)) };
    missing = (spec.panels || []).filter((p) => !(p.image && fs.existsSync(path.resolve(spec._dir || '.', p.image)))).map((p) => p.id);
    if (missing.length && !opts.allowPlaceholder) {
      throw new Error(`컷 이미지가 없는 컷: ${missing.join(', ')}\n그림을 spec에 연결하거나(image 또는 art), 레이아웃 리허설이면 --allow-placeholder 를 붙이세요.`);
    }
    built = buildHtml(spec);
    const htmlPath = path.join(outDir, 'layout.html');
    fs.writeFileSync(htmlPath, built.html);
    const page = await browser.newPage({ viewport: { width: built.size.w, height: 1200 }, deviceScaleFactor: scale });
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 15000 });
    const report = await page.evaluate(() => {
      const root = document.getElementById('root').getBoundingClientRect();
      const out = { panels: [], blocks: [], bad: [], small: [], mismatch: [], height: Math.ceil(root.height) };
      document.querySelectorAll('[data-panel]').forEach((el) => {
        const r = el.getBoundingClientRect();
        out.panels.push({ id: el.dataset.panel, x: r.left - root.left, y: r.top - root.top, w: r.width, h: r.height });
        const bs = [...el.querySelectorAll('[data-bubble]')].map((b) => ({ el: b, r: b.getBoundingClientRect() }));
        bs.forEach(({ el: b, r: br }, i) => {
          const label = `${el.dataset.panel} #${i + 1}「${b.textContent.slice(0, 12)}」`;
          if (br.left < r.left - 2 || br.top < r.top - 2 || br.right > r.right + 2 || br.bottom > r.bottom + 2) out.bad.push(`${label}: 컷 밖으로 나갑니다`);
          const fsz = parseFloat(getComputedStyle(b).fontSize);
          if (!b.classList.contains('sfx') && fsz * (400 / document.getElementById('root').getBoundingClientRect().width) < 13) out.small.push(`${label}: 글자가 ${fsz.toFixed(0)}px — 폰에서 작게 보입니다`);
          for (let j = i + 1; j < bs.length; j++) {
            const o = bs[j].r;
            if (!(br.right < o.left || o.right < br.left || br.bottom < o.top || o.bottom < br.top)) out.bad.push(`${label}: 다음 말풍선과 겹칩니다`);
          }
        });
        const a = el.querySelector('[data-art]');
        if (a && a.naturalWidth) {
          const ir = a.naturalWidth / a.naturalHeight, pr = r.width / r.height;
          if (Math.abs(ir / pr - 1) > 0.18) out.mismatch.push(`${el.dataset.panel}: 그림 비율 ${ir.toFixed(2)} ↔ 컷 비율 ${pr.toFixed(2)} — 가장자리가 잘립니다`);
        }
      });
      document.querySelectorAll('[data-block]').forEach((el) => {
        const r = el.getBoundingClientRect();
        out.blocks.push({ kind: el.dataset.block, y: r.top - root.top, h: r.height });
      });
      return out;
    });
    warnings.push(...report.bad, ...report.small, ...report.mismatch);
    const H = report.height;
    const gap = spec.gap ?? 24;

    if (built.lay.mode === 'grid') {
      const f = path.join(outDir, `fourcut-${spec.format || '1x1'}.png`);
      await page.screenshot({ path: f, fullPage: true, clip: { x: 0, y: 0, width: built.size.w, height: H } });
      files.push({ file: path.basename(f), width: built.size.w * scale, height: H * scale });
    } else {
      const full = path.join(outDir, 'full.png');
      await page.screenshot({ path: full, fullPage: true });
      files.push({ file: 'full.png', width: built.size.w * scale, height: H * scale });
      // 컷 경계에서만 자르는 페이지 분할
      const maxH = spec.pageMaxHeight || 1280;
      // 제목 줄은 첫 컷에, 안내 줄은 마지막 컷에 붙여서 한 덩어리로 자른다(제목만 있는 페이지 방지)
      const units = report.panels.map((p) => ({ y: p.y, h: p.h })).sort((a, b) => a.y - b.y);
      const title = report.blocks.find((b) => b.kind === 'title');
      const foot = report.blocks.find((b) => b.kind === 'foot');
      if (title && units.length) { units[0].h += units[0].y - title.y; units[0].y = title.y; }
      if (foot && units.length) { const l = units[units.length - 1]; l.h = foot.y + foot.h - l.y; }
      const pages = [];
      let cur = null;
      for (const u of units) {
        const end = u.y + u.h;
        if (cur && end - cur.y <= maxH) cur.end = end;
        else { if (cur) pages.push(cur); cur = { y: u.y, end }; if (u.h > maxH) warnings.push(`높이 ${Math.round(u.h)}px 컷은 페이지 한도 ${maxH}px보다 커서 혼자 한 페이지가 됩니다`); }
      }
      if (cur) pages.push(cur);
      for (let i = 0; i < pages.length; i++) {
        const top = i === 0 ? 0 : pages[i].y;
        const bottom = i === pages.length - 1 ? H : pages[i].end + gap;
        const f = path.join(outDir, `page-${String(i + 1).padStart(2, '0')}.png`);
        await page.screenshot({ path: f, fullPage: true, clip: { x: 0, y: top, width: built.size.w, height: Math.min(bottom, H) - top } });
        files.push({ file: path.basename(f), width: built.size.w * scale, height: (Math.min(bottom, H) - top) * scale });
      }
    }
  } finally { await browser.close(); }
  const manifest = { title: spec.title, kind: spec.kind || 'four-cut', layout: built.lay, scale, files, placeholders: missing, warnings, factCheck: check_.facts, generated: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

/* ───────────────────────── CLI ───────────────────────── */

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = parseArgs(rest);
  if (cmd === 'init') {
    const k = a.kind || 'four-cut';
    if (!STARTERS[k]) throw new Error(`--kind은 ${Object.keys(STARTERS).join('|')} 중 하나`);
    const out = a.out || 'webtoon-spec.json';
    if (fs.existsSync(out)) throw new Error(`이미 있는 파일입니다: ${out}`);
    fs.writeFileSync(out, JSON.stringify(STARTERS[k](), null, 2) + '\n');
    console.log(`시작 spec을 만들었습니다: ${out}`);
  } else if (cmd === 'check') {
    const r = check(loadSpec(a.spec));
    r.errors.forEach((e) => console.log(`오류  ${e}`));
    r.warnings.forEach((w) => console.log(`경고  ${w}`));
    if (r.facts.length) { console.log('\n대표 확인 자료와 대조할 수치·날짜:'); r.facts.forEach((f) => console.log(`  - ${f}`)); }
    console.log(`\n오류 ${r.errors.length} · 경고 ${r.warnings.length} · 대조 항목 ${r.facts.length}`);
    process.exit(r.errors.length ? 1 : 0);
  } else if (cmd === 'prompts') {
    const spec = loadSpec(a.spec);
    const md = buildPrompts(spec);
    if (a.out) { fs.writeFileSync(a.out, md + '\n'); console.log(`프롬프트를 저장했습니다: ${a.out}`); } else console.log(md);
  } else if (cmd === 'art-size') {
    const spec = loadSpec(a.spec);
    (spec.panels || []).forEach((p) => { const z = artSize(spec, p); console.log(`${p.id}  ${z.w}×${z.h}  (${ratioText(z.w, z.h)})`); });
  } else if (cmd === 'art-init') {
    const spec = loadSpec(a.spec);
    const dir = a.outDir || 'art';
    fs.mkdirSync(dir, { recursive: true });
    const raw = JSON.parse(fs.readFileSync(path.resolve(a.spec), 'utf8'));
    (spec.panels || []).forEach((p, i) => {
      const f = path.join(dir, `${p.id}.svg`);
      if (fs.existsSync(f)) { console.log(`건너뜀(이미 있음): ${f}`); return; }
      fs.writeFileSync(f, artSkeleton(spec, p));
      console.log(`만들었습니다: ${f}`);
      if (a.link && !raw.panels[i].art) raw.panels[i].art = path.relative(path.dirname(path.resolve(a.spec)), path.resolve(f)).split(path.sep).join('/');
    });
    if (a.link) { fs.writeFileSync(path.resolve(a.spec), JSON.stringify(raw, null, 2) + '\n'); console.log('spec의 panels[].art 를 연결했습니다'); }
    else console.log('spec의 panels[].art 에 각 파일 경로를 적거나, 다시 실행할 때 --link 를 붙이세요');
  } else if (cmd === 'art') {
    const spec = loadSpec(a.spec);
    let chromium;
    try { ({ chromium } = await import('playwright')); } catch { throw new Error('Playwright가 없습니다. `npm i playwright` 후 `npx playwright install chromium` 을 실행하세요.'); }
    const browser = await chromium.launch();
    try {
      const r = await renderArts(browser, spec, a.outDir || '_art', { guides: a.guides });
      Object.entries(r.map).forEach(([id, f]) => console.log(`${id}  ${f}`));
      r.warnings.forEach((w) => console.log(`경고  ${w}`));
      if (!Object.keys(r.map).length) console.log('렌더할 컷이 없습니다(art 필드가 있고 image가 비어 있는 컷만 렌더합니다)');
    } finally { await browser.close(); }
  } else if (cmd === 'compose') {
    const m = await compose(loadSpec(a.spec), a.outDir || '_webtoon', { scale: a.scale, allowPlaceholder: a.allowPlaceholder, guides: a.guides });
    m.files.forEach((f) => console.log(`${f.file}  ${f.width}×${f.height}`));
    if (m.placeholders.length) console.log(`자리표시 컷: ${m.placeholders.join(', ')} (실제 그림으로 교체 필요)`);
    m.warnings.forEach((w) => console.log(`경고  ${w}`));
    if (m.factCheck.length) console.log(`대조할 수치·날짜 ${m.factCheck.length}건 — manifest.json의 factCheck 참고`);
  } else {
    console.log('명령: init | check | prompts | art-size | art-init | art | compose  (맨 위 주석 참고)');
    process.exit(cmd ? 1 : 0);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
