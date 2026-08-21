/**
 * tests/styles.mjs — 스타일 레지스트리 회귀 (의존성 없음)
 *
 * 이 레지스트리는 문서에서 뽑아낸 파생물이다. 그래서 두 가지를 지켜야 한다.
 *  1. 추출이 60개를 다 잡는다 (문서가 바뀌면 여기서 먼저 깨진다)
 *  2. 유도한 값이 실제 내용과 맞는다 (hex·낱말 근거)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractStyles, extractShowcases, slugify } from '../scripts/design/lib/styles/extract.mjs';
import { loadRegistry, searchStyles, getStyle, findSimilar, suggestDirections, buildStyleEntry, isStale, SOURCE_PATH } from '../scripts/design/lib/styles/registry.mjs';
import { validate } from '../scripts/design/lib/schema.mjs';
import { runOperation } from '../scripts/design/lib/api/operations.mjs';
import { EXIT } from '../scripts/design/lib/util.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = path.join(ROOT, 'examples', 'design-studio-intro');

function tmpCopy(src = EXAMPLE) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'design-styles-'));
  copyDir(src, dest, ['out', 'qa.json', 'qa-report.html', '.design']);
  return dest;
}
function copyDir(src, dest, skip) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.includes(e.name)) continue;
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(from, to, skip);
    else fs.copyFileSync(from, to);
  }
}

export function run(test, assert, design) {
  const registry = loadRegistry();

  /* ── 추출 ── */

  test('스타일 60종이 모두 추출된다', () => {
    assert(registry.styles.length === 60, `${registry.styles.length}개 — 문서가 바뀌었다면 design styles rebuild`);
  });

  test('분류가 20/20/20으로 나뉜다', () => {
    const by = {};
    for (const s of registry.styles) by[s.section] = (by[s.section] || 0) + 1;
    assert(by.web === 20 && by.deck === 20 && by.infographic === 20, JSON.stringify(by));
  });

  test('id가 중복되지 않는다', () => {
    const ids = registry.styles.map((s) => s.id);
    const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
    assert(dup.length === 0, `중복: ${dup.join(', ')}`);
  });

  test('레지스트리가 스키마를 통과한다', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'style.schema.json'), 'utf8'));
    const r = validate(registry, schema);
    assert(r.valid, JSON.stringify(r.errors.slice(0, 5)));
  });

  test('모든 항목이 DNA·구현·용도를 갖는다', () => {
    for (const s of registry.styles) {
      assert(s.dna && s.dna.length > 20, `${s.id}: DNA 없음`);
      assert(s.html && s.html.length > 10, `${s.id}: 구현 설명 없음`);
      assert(s.audiences.length > 0, `${s.id}: 용도 없음`);
      assert(s.fidelity > 0 && s.fidelity <= 100, `${s.id}: 재현도 ${s.fidelity}`);
    }
  });

  test('레지스트리가 원본 문서와 같은 판이다', () => {
    const src = path.join(ROOT, SOURCE_PATH);
    if (!fs.existsSync(src)) return;   // 원본이 없는 배포본
    const stale = isStale(registry);
    assert(!stale.stale, `${stale.reason} — design styles rebuild 후 커밋하세요`);
  });

  test('슬러그가 영문 이름에서 안정적으로 나온다', () => {
    assert(slugify('미디어급 브루탈리즘 Editorial Brutalism（거대 Helvetica 글꼴로 본문을 축소）') === 'editorial-brutalism', '괄호 제거 실패');
    assert(slugify('신 스위스 대자보 / Neo-Swiss Billboard Editorial') === 'neo-swiss-billboard-editorial', '슬래시 처리 실패');
  });

  /* ── 유도한 값 ── */

  test('hex 안의 3D를 3D 그래픽으로 오해하지 않는다', () => {
    // #FF433D 안의 "3D" 때문에 정적 스타일이 expressive로 잘못 분류됐던 사고
    const brut = getStyle('editorial-brutalism', registry);
    assert(brut, 'editorial-brutalism 없음');
    assert(brut.motionLevel !== 'expressive', `모션 ${brut.motionLevel} — 순수 CSS 정적 스타일입니다`);
  });

  test('3자리 hex도 팔레트에 들어간다', () => {
    // 문서는 `순수 검정#000`처럼 3자리를 쓴다. 6자리만 보면 배경색 절반을 놓친다.
    const brut = getStyle('editorial-brutalism', registry);
    assert(brut.palette.includes('#000000'), `팔레트에 검정 없음: ${brut.palette.join(',')}`);
    assert(brut.palette.includes('#FFFFFF'), `팔레트에 흰색 없음: ${brut.palette.join(',')}`);
  });

  test('검정+흰색이 함께 나오면 mixed로 본다', () => {
    assert(getStyle('editorial-brutalism', registry).contrast === 'mixed', '고대비 흑백을 한쪽으로 몰았습니다');
  });

  test('대비를 대부분 유도해낸다 (unknown 10개 미만)', () => {
    const unknown = registry.styles.filter((s) => s.contrast === 'unknown');
    assert(unknown.length < 10, `unknown ${unknown.length}개: ${unknown.map((s) => s.id).join(', ')}`);
  });

  test('팔레트 색이 전부 정규화된 6자리다', () => {
    for (const s of registry.styles) {
      for (const hex of s.palette) assert(/^#[0-9A-F]{6}$/.test(hex), `${s.id}: ${hex}`);
    }
  });

  /* ── 검색 ── */

  test('빈 배열 조건은 조건 없음으로 본다', () => {
    // 빈 배열은 truthy라 그대로 필터에 넣으면 전부 걸러진다 (실제로 겪은 버그)
    const all = searchStyles({ supports: [], temperature: [], contrast: [] }, registry);
    assert(all.length === 60, `${all.length}개 — 빈 조건이 전부를 걸러냈습니다`);
  });

  test('조건을 겹쳐 좁힐 수 있다', () => {
    const found = searchStyles({ supports: ['deck'], temperature: ['bold'], minFidelity: 90 }, registry);
    assert(found.length > 0, '결과 없음');
    for (const s of found) {
      assert(s.supports.includes('deck'), `${s.id}: deck 미지원`);
      assert(s.temperature === 'bold', `${s.id}: ${s.temperature}`);
      assert(s.fidelity >= 90, `${s.id}: ${s.fidelity}%`);
    }
  });

  test('재현도 높은 순으로 정렬된다', () => {
    const found = searchStyles({ supports: ['html'] }, registry);
    for (let i = 1; i < found.length; i += 1) {
      assert(found[i - 1].fidelity >= found[i].fidelity, `정렬 깨짐: ${found[i - 1].id} < ${found[i].id}`);
    }
  });

  test('텍스트 검색이 DNA·참고사례까지 훑는다', () => {
    const found = searchStyles({ text: '스위스' }, registry);
    assert(found.length >= 3, `${found.length}개 — 원문 검색이 좁습니다`);
  });

  test('오타를 편집 거리로 잡는다', () => {
    // 부분 문자열 검색으로는 못 잡는다 — 'repot'은 아무것도 포함하지 않는다
    const near = findSimilar('swiss-grid-repot', {}, registry);
    assert(near.some((s) => s.id === 'swiss-grid-report'), `못 잡음: ${JSON.stringify(near)}`);
    assert(findSimilar('완전히-다른-이름', {}, registry).length === 0, '엉뚱한 것을 비슷하다고 함');
  });

  /* ── 삼방향 추천 ── */

  test('세 방향의 온도가 겹치지 않는다', () => {
    // 문서가 직접 말하는 실패 모드: 셋 다 조용한 것
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const r = suggestDirections({ deliverables: ['deck'], seed }, registry);
      assert(r.candidates.length === 3, `seed=${seed}: 후보 ${r.candidates.length}개`);
      const temps = new Set(r.candidates.map((c) => c.temperature));
      assert(temps.size === 3, `seed=${seed}: 온도가 ${[...temps].join(',')} — 겹쳤습니다`);
    }
  });

  test('대담 방향이 반드시 하나 들어간다', () => {
    for (const deliv of [['html'], ['deck'], ['infographic']]) {
      const r = suggestDirections({ deliverables: deliv, seed: 'x' }, registry);
      assert(r.candidates.some((c) => c.temperature === 'bold'), `${deliv}: 대담 없음`);
    }
  });

  test('같은 씨앗은 같은 후보를 낸다 (재현 가능)', () => {
    const a = suggestDirections({ deliverables: ['html'], seed: 'same' }, registry);
    const b = suggestDirections({ deliverables: ['html'], seed: 'same' }, registry);
    assert(
      a.candidates.map((c) => c.style.id).join() === b.candidates.map((c) => c.style.id).join(),
      '같은 씨앗인데 결과가 다릅니다'
    );
  });

  test('다른 씨앗은 다른 후보를 낸다', () => {
    const seen = new Set();
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      seen.add(suggestDirections({ deliverables: ['html'], seed }, registry).candidates.map((c) => c.style.id).join());
    }
    assert(seen.size >= 3, `조합 ${seen.size}가지 — 씨앗이 결과를 못 바꿉니다`);
  });

  test('추천이 산출물 종류를 지킨다', () => {
    const r = suggestDirections({ deliverables: ['deck'], seed: 'k' }, registry);
    for (const cand of r.candidates) {
      assert(cand.style.supports.includes('deck'), `${cand.style.id}는 deck을 지원하지 않습니다`);
    }
  });

  test('추천이 낮은 재현도를 기본으로 피한다', () => {
    let low = 0;
    for (const seed of ['p1', 'p2', 'p3', 'p4', 'p5']) {
      for (const cand of suggestDirections({ deliverables: ['html'], seed }, registry).candidates) {
        if (cand.style.fidelity < 70) low += 1;
      }
    }
    assert(low === 0, `재현도 70% 미만이 ${low}번 추천됐습니다`);
  });

  /* ── 매니페스트 적용 ── */

  test('apply가 토큰을 자동으로 덮어쓰지 않는다', () => {
    // 문서의 hex는 배합표가 아니라 앵커다. 자동 반영하면 100명이 같은 색을 쓴다.
    const dir = tmpCopy();
    const before = JSON.parse(fs.readFileSync(path.join(dir, 'design-project.json'), 'utf8')).brand.tokens;
    const r = runOperation('styles', {
      project: dir, action: 'apply', id: 'swiss-grid-report',
      rationale: '데이터가 주인공이고 인쇄물 같은 신뢰감이 필요하다',
    });
    assert(r.ok, JSON.stringify(r.errors));
    const after = JSON.parse(fs.readFileSync(path.join(dir, 'design-project.json'), 'utf8'));
    assert(JSON.stringify(after.brand.tokens) === JSON.stringify(before), '토큰이 자동으로 바뀌었습니다');
    assert(after.style.id === 'swiss-grid-report', '스타일이 기록되지 않음');
    assert(r.paletteNote, '앵커 주의를 안내하지 않습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('근거 없는 apply는 거부된다', () => {
    const dir = tmpCopy();
    const r = runOperation('styles', { project: dir, action: 'apply', id: 'swiss-grid-report' });
    assert(!r.ok && r.code === EXIT.USAGE, `code=${r.code}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('buildStyleEntry가 검수를 통과하는 형태를 만든다', () => {
    const style = getStyle('swiss-grid-report', registry);
    const entry = buildStyleEntry(style, { rationale: '데이터 밀도가 높고 신뢰감이 필요하다' });
    assert(entry.id === style.id && entry.rationale.length >= 8, JSON.stringify(entry));
    assert(Array.isArray(entry.supports) && entry.supports.length > 0, 'supports 없음');
  });

  /* ── 검수 연동 ── */

  test('오타로 보이는 스타일 id에만 경고한다', () => {
    const dir = tmpCopy();
    const f = path.join(dir, 'design-project.json');

    // 직접 정의한 방향(레지스트리 밖) — 문서가 허용하는 정상 사용이므로 조용해야 한다
    let out = design(['check'], dir);
    assert(!out.out.includes('style.unknown'), `직접 정의한 스타일에 경고: \n${out.out}`);

    // 오타로 보이는 id — 안내해야 한다
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    m.style.id = 'swiss-grid-repot';
    fs.writeFileSync(f, JSON.stringify(m, null, 2));
    out = design(['check'], dir);
    assert(out.out.includes('swiss-grid-report'), `오타 안내 없음:\n${out.out}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('재현도 낮은 스타일을 쓰면 밝히라고 경고한다', () => {
    const dir = tmpCopy();
    const f = path.join(dir, 'design-project.json');
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    m.style.id = 'memphis-maximalism';   // 재현도 72%
    fs.writeFileSync(f, JSON.stringify(m, null, 2));
    const low = getStyle('memphis-maximalism', registry);
    if (low.fidelity >= 70) { fs.rmSync(dir, { recursive: true, force: true }); return; }
    const out = design(['check'], dir);
    assert(out.out.includes('재현도'), `재현도 경고 없음:\n${out.out}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /* ── CLI · API ── */

  test('styles CLI 하위 명령이 모두 동작한다', () => {
    assert(design(['styles', 'list', '--limit', '5'], ROOT).code === EXIT.OK, 'list 실패');
    assert(design(['styles', 'show', 'swiss-grid-report'], ROOT).code === EXIT.OK, 'show 실패');
    assert(design(['styles', 'suggest', '--noProject', '--deliverables', 'deck'], ROOT).code === EXIT.OK, 'suggest 실패');
    assert(design(['styles', 'show', '없는스타일'], ROOT).code === EXIT.NOT_FOUND, 'show 오류 코드 불일치');
  });

  test('styles 작업이 API에서도 같은 결과를 낸다', () => {
    const search = runOperation('styles', { action: 'search', supports: ['deck'], temperature: ['bold'] });
    assert(search.ok && search.styles.length > 0, JSON.stringify(search).slice(0, 200));
    assert(search.total === 60, `전체 ${search.total}`);

    const show = runOperation('styles', { action: 'show', id: 'swiss-grid-report' });
    assert(show.ok && show.style.dna, '상세 조회 실패');
    assert(show.paletteNote, '앵커 주의 없음');

    const suggest = runOperation('styles', { action: 'suggest', supports: ['deck'], seed: 'api' });
    assert(suggest.ok && suggest.candidates.length === 3, `후보 ${suggest.candidates?.length}`);
    assert(new Set(suggest.candidates.map((c) => c.temperature)).size === 3, '온도가 겹침');
    assert(suggest.nextStep.includes('실제 초안'), '진짜 시안이어야 한다는 안내가 없음');
  });

  test('없는 스타일을 조회하면 비슷한 것을 알려준다', () => {
    const r = runOperation('styles', { action: 'show', id: 'swiss-grid-repot' });
    assert(!r.ok && r.code === EXIT.NOT_FOUND, `code=${r.code}`);
    assert(r.errors[0].message.includes('swiss-grid-report'), `안내 없음: ${r.errors[0].message}`);
  });

  test('예제 갤러리도 함께 추출된다', () => {
    assert(registry.showcases.length >= 6, `장면 ${registry.showcases.length}개`);
    for (const sc of registry.showcases) {
      assert(Object.keys(sc.variants).length === 3, `${sc.scene}: 변형 ${Object.keys(sc.variants).length}개`);
    }
  });

  test('추출기가 형태가 깨진 항목을 조용히 넘기지 않는다', () => {
    const broken = `## 웹 스타일 라이브러리(20종)\n\n#### 대담파\n\n**형태 깨진 항목 Broken Entry** \`대담·재현90%\`\n- 참고:something\n\n`;
    const { styles, stats } = extractStyles(broken);
    assert(styles.length === 0, '필드가 없는데 통과시켰습니다');
    assert(stats.skipped.length === 1, `건너뜀 ${stats.skipped.length}개 — 보고하지 않았습니다`);
    assert(stats.skipped[0].reason.includes('필드 누락'), stats.skipped[0].reason);
  });

  test('showcase 표를 파싱한다', () => {
    const md = '| 1 | 공식 계정 표지 | 1200×510 | `cover/cover-pentagram` | `cover/cover-build` | `cover/cover-takram` |';
    const out = extractShowcases(md);
    assert(out.length === 1 && out[0].variants.takram.endsWith('cover-takram.png'), JSON.stringify(out));
  });
}
