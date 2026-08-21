/**
 * tests/quality.mjs — 조판·접근성·유출 검사 회귀 (의존성 없음)
 *
 * 실패 픽스처가 "잡는다"를 증명하는 일은 run.mjs의 MUST_CATCH가 맡는다. 여기서는
 * 그 반대편을 증명한다 — **멀쩡한 것을 잡지 않는다.** 검사기가 죽는 방식은 두 가지고,
 * 놓치는 쪽보다 잘못 잡는 쪽이 훨씬 빨리 죽는다. 경고가 늘 켜져 있으면 사람은 보고서를
 * 통째로 무시하기 시작하고, 그 순간 진짜 오류도 함께 묻힌다.
 *
 * 그리고 렌더러와 검사기가 같은 기준값을 쓰는지도 여기서 붙잡아 둔다. 둘이 갈라지면
 * "검수는 통과했는데 화면은 틀린" 상태가 만들어지고, 그건 검사가 없는 것보다 나쁘다.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as typography from '../scripts/design/lib/checks/typography.mjs';
import * as a11y from '../scripts/design/lib/checks/a11y.mjs';
import * as security from '../scripts/design/lib/checks/security.mjs';
import * as content from '../scripts/design/lib/checks/content.mjs';
import { PLACEHOLDERS } from '../scripts/design/lib/scaffold.mjs';
import { defaultLineHeight, defaultTracking, bodyBaseline, isCjkLang, hasCjk } from '../scripts/design/lib/render/shared.mjs';
import { renderIrFiles } from '../scripts/design/lib/render/core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 검사기가 요구하는 최소한의 ctx를 임시 폴더에 만든다. */
function scaffold(manifest, irs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-quality-'));
  fs.mkdirSync(path.join(dir, 'ir'), { recursive: true });
  const full = {
    schemaVersion: '1.0',
    id: 'q',
    name: 'q',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
    brief: { purpose: 'p', audience: 'a', language: 'ko', deliverables: ['deck'] },
    brand: { name: 'q', tokens: {} },
    assets: [],
    references: [],
    sources: [],
    approvals: {},
    artifacts: [],
    qa: { status: 'never' },
    ...manifest,
  };
  full.artifacts = Object.keys(irs).map((id) => ({
    id,
    type: irs[id].type,
    title: id,
    ir: `ir/${id}.json`,
    status: 'planned',
    outputs: [],
  }));
  for (const [id, ir] of Object.entries(irs)) {
    fs.writeFileSync(path.join(dir, 'ir', `${id}.json`), JSON.stringify({ schemaVersion: '1.0', id, title: id, ...ir }));
  }
  fs.writeFileSync(path.join(dir, 'design-project.json'), JSON.stringify(full));
  return { dir, manifest: full };
}

const ids = (findings) => findings.map((f) => f.check);
const deck = (blocks) => ({ type: 'deck', canvas: { width: 1920, height: 1080 }, slides: [{ id: 's1', layout: 'statement', blocks }] });

export function run(test, assert) {
  /* ── 조판: 잘못 잡지 않는다 ─────────────────────────────────── */

  test('한글 폴백 사슬이 제대로 서 있으면 아무 말도 하지 않는다', () => {
    const { dir, manifest } = scaffold(
      {
        brand: {
          name: 'q',
          tokens: {
            typography: {
              display: { family: 'Newsreader', weights: [600], fallback: ['Noto Serif KR', 'serif'] },
              body: { family: 'Geist', weights: [400], fallback: ['Pretendard', 'Noto Sans KR', 'sans-serif'] },
              scale: [16, 20, 25, 31, 39],
            },
          },
        },
      },
      { d: deck([{ id: 'h', kind: 'heading', text: '괜찮은 제목', box: { x: 100, y: 100, w: 1400, h: 200 }, style: { fontRole: 'display', fontSize: 72, weight: 600 } }]) }
    );
    const found = ids(typography.run({ dir, manifest }));
    assert(found.length === 0, `깨끗해야 하는데: ${found.join(', ')}`);
  });

  test('영문 인용은 한글 프로젝트 안에서도 서문 기준으로 본다', () => {
    // lang=ko지만 이 블록의 글자는 라틴이다. 한글 행간(1.7)을 요구하면 안 된다.
    const { dir, manifest } = scaffold(
      { brand: { name: 'q', tokens: { typography: { body: { family: 'Geist', fallback: ['Pretendard', 'sans-serif'] } } } } },
      {
        d: deck([
          {
            id: 'en',
            kind: 'body',
            text: 'The quality gate does not pass unless the artifact does.',
            box: { x: 100, y: 100, w: 900, h: 200 },
            style: { fontSize: 28, lineHeight: 1.5 },
          },
        ]),
      }
    );
    const found = ids(typography.run({ dir, manifest }));
    assert(!found.includes('type.lineHeight'), `서문 1.5는 정상인데 걸렸다: ${found.join(', ')}`);
  });

  test('같은 픽셀이라도 매체에 따라 대자인지가 갈린다', () => {
    // 절대 픽셀로 판정하면 여기서 무너진다. 72px는 슬라이드에서는 대자지만
    // 영상(본문 40px)에서는 아직 표제 크기다.
    const onDeck = defaultLineHeight('heading', 72, true, bodyBaseline('deck'));
    const onVideo = defaultLineHeight('heading', 72, true, bodyBaseline('video'));
    assert(onDeck < 1.3, `덱 72px가 대자로 안 잡혔다: ${onDeck}`);
    assert(onVideo > 1.3, `영상 72px가 대자로 잡혔다: ${onVideo}`);
    // 슬라이드 36px 불릿은 어느 쪽에서도 본문이다
    assert(defaultLineHeight('bullets', 36, true, bodyBaseline('deck')) > 1.6, '덱 36px 불릿이 표제 취급됐다');
  });

  test('한글 표제는 자간을 조이지 않고 서문 표제는 조인다', () => {
    const deckBase = bodyBaseline('deck');
    // typography.md 4.5: 한글 표제(24-48px)는 0, 대자(60px 이상)에서만 -0.02em까지
    assert(defaultTracking('heading', 40, true, deckBase) === 0, '한글 40px 표제에 음수 자간이 붙었다');
    assert(defaultTracking('heading', 40, false, deckBase) < 0, '서문 표제가 조여지지 않았다');
    assert(defaultTracking('heading', 96, true, deckBase) === -0.02, '한글 대자에서 -0.02em이 나오지 않았다');
    assert(defaultTracking('body', 96, true, deckBase) === -0.02, '대자는 종류와 무관하게 대자다');
  });

  test('싣지 않은 굵기만 잡고, 실은 굵기는 통과시킨다', () => {
    const mk = (weight) =>
      scaffold(
        { brand: { name: 'q', tokens: { typography: { display: { family: 'Pretendard', weights: [600, 800], fallback: ['sans-serif'] } } } } },
        { d: deck([{ id: 'h', kind: 'heading', text: '제목', box: { x: 100, y: 100, w: 1400, h: 200 }, style: { fontRole: 'display', fontSize: 72, weight } }]) }
      );
    const bad = mk(700);
    const good = mk(800);
    assert(ids(typography.run(bad)).includes('type.weightSynthesis'), '700을 놓쳤다');
    assert(!ids(typography.run(good)).includes('type.weightSynthesis'), '800을 잘못 잡았다');
  });

  test('한 줄에 다 들어가는 짧은 문장은 행장 판정을 하지 않는다', () => {
    const { dir, manifest } = scaffold(
      { brand: { name: 'q', tokens: { typography: { body: { family: 'Pretendard', fallback: ['sans-serif'] } } } } },
      { d: deck([{ id: 'b', kind: 'body', text: '짧다', box: { x: 0, y: 0, w: 1900, h: 100 }, style: { fontSize: 20 } }]) }
    );
    assert(!ids(typography.run({ dir, manifest })).includes('type.measure'), '한 줄짜리에 행장 경고가 붙었다');
  });

  test('code 블록 안의 곧은 따옴표는 따옴표 규칙에서 뺀다', () => {
    const { dir, manifest } = scaffold(
      {},
      { d: deck([{ id: 'c', kind: 'code', text: 'const a = "b";', box: { x: 0, y: 0, w: 800, h: 100 }, style: { fontSize: 24 } }]) }
    );
    assert(!ids(typography.run({ dir, manifest })).includes('type.quotes'), '코드의 따옴표를 조판 문제로 봤다');
  });

  /* ── 접근성 ────────────────────────────────────────────────── */

  test('내용을 말하는 대체 텍스트는 통과한다', () => {
    const { dir, manifest } = scaffold(
      { assets: [{ id: 'a1', kind: 'image', path: 'x.png', alt: '검수 보고서에서 오류 세 건이 빨간색으로 표시된 화면' }] },
      { d: deck([{ id: 'i', kind: 'image', assetId: 'a1', box: { x: 0, y: 0, w: 400, h: 300 } }]) }
    );
    const found = ids(a11y.run({ dir, manifest }));
    assert(!found.includes('a11y.altQuality'), `제대로 된 alt이 걸렸다: ${found.join(', ')}`);
  });

  test('같은 줄에 나란히 놓인 블록은 왼쪽부터가 정상 순서다', () => {
    // y가 조금 달라도 같은 행이면 x 순서로 읽는다. 이걸 놓치면 2단 배치가 전부 걸린다.
    const { dir, manifest } = scaffold({}, {
      d: deck([
        { id: 'left', kind: 'body', text: '왼쪽', box: { x: 100, y: 300, w: 700, h: 200 }, style: { fontSize: 28 } },
        { id: 'right', kind: 'body', text: '오른쪽', box: { x: 900, y: 320, w: 700, h: 200 }, style: { fontSize: 28 } },
      ]),
    });
    assert(!ids(a11y.run({ dir, manifest })).includes('a11y.readingOrder'), '같은 행의 좌→우 배치를 어긋났다고 봤다');
  });

  test('자막 속도는 실제 글자로 재고 공백은 세지 않는다', () => {
    const mk = (subtitle, durationMs) =>
      scaffold({}, {
        v: { type: 'video', canvas: { width: 1920, height: 1080, fps: 30 }, scenes: [{ id: 's', startMs: 0, durationMs, subtitle, layers: [] }] },
      });
    const fast = a11y.run(mk('규칙을 검사로 바꾸면 사람이 기억하지 않아도 된다', 1000));
    const calm = a11y.run(mk('규칙을 검사로', 4000));
    assert(ids(fast).includes('a11y.subtitleRate'), '초당 24자를 놓쳤다');
    assert(!ids(calm).includes('a11y.subtitleRate'), '느린 자막을 잘못 잡았다');
  });

  test('보이스오버가 없으면 자막을 요구하지 않는다', () => {
    const { dir, manifest } = scaffold({}, {
      v: { type: 'video', canvas: { width: 1920, height: 1080, fps: 30 }, scenes: [{ id: 's', startMs: 0, durationMs: 3000, layers: [] }] },
    });
    assert(!ids(a11y.run({ dir, manifest })).includes('a11y.captions'), '소리가 없는 영상에 자막을 요구했다');
  });

  test('언어와 내용이 맞으면 아무 말도 하지 않는다', () => {
    const ko = scaffold({}, { d: deck([{ id: 'b', kind: 'body', text: '한글로 적힌 본문이 충분히 길게 이어지는 경우를 만들기 위해 문장을 늘려 둔다', box: { x: 0, y: 0, w: 1400, h: 300 }, style: { fontSize: 28 } }]) });
    const en = scaffold({ brief: { purpose: 'p', audience: 'a', language: 'en', deliverables: ['deck'] } }, {
      d: deck([{ id: 'b', kind: 'body', text: 'This paragraph is written entirely in Latin script so the declared language matches.', box: { x: 0, y: 0, w: 1400, h: 300 }, style: { fontSize: 28 } }]),
    });
    assert(!ids(a11y.run(ko)).includes('a11y.langMismatch'), 'ko + 한글을 어긋났다고 봤다');
    assert(!ids(a11y.run(en)).includes('a11y.langMismatch'), 'en + 라틴을 어긋났다고 봤다');
  });

  /* ── 내용: 아직 안 쓴 것과 잘못 쓴 것은 다른 실패다 ────────── */

  test('검사기가 스캐폴드와 같은 자리표시자 목록을 본다', () => {
    // 목록을 양쪽에 따로 적으면 갈라진다. 실제로 갈라져서 자리표시자가 렌더돼 나갔다.
    assert(PLACEHOLDERS.length >= 3, `자리표시자 ${PLACEHOLDERS.length}개`);
    const { dir, manifest } = scaffold(
      { brief: { purpose: PLACEHOLDERS[0], audience: 'a', language: 'ko', deliverables: ['deck'] } },
      { d: deck([{ id: 't', kind: 'body', text: PLACEHOLDERS[0], box: { x: 0, y: 0, w: 900, h: 100 }, style: { fontSize: 28 } }]) }
    );
    const found = content.run({ dir, manifest });
    const rendered = found.filter((f) => f.check === 'content.placeholder' && f.level === 'error');
    const source = found.filter((f) => f.check === 'content.placeholder' && f.level === 'warn');
    assert(rendered.length === 1, `렌더되는 자리는 오류여야 한다 (${rendered.length}건)`);
    assert(source.length === 1, `매니페스트 쪽은 경고여야 한다 (${source.length}건)`);
  });

  test('사람이 쓴 짧은 문장을 더미로 몰지 않는다', () => {
    // "테스트"만 있으면 더미지만, 테스트를 설명하는 문장은 내용이다.
    const { dir, manifest } = scaffold({}, {
      d: deck([
        { id: 'a', kind: 'body', text: '테스트를 먼저 쓰면 무엇이 깨졌는지 이름이 붙는다', box: { x: 0, y: 0, w: 1200, h: 100 }, style: { fontSize: 28 } },
        { id: 'b', kind: 'heading', text: '제목을 정하는 방법', box: { x: 0, y: 200, w: 1200, h: 120 }, style: { fontSize: 56 } },
        { id: 'c', kind: 'body', text: 'XXPRESS 라는 회사 이름', box: { x: 0, y: 400, w: 1200, h: 100 }, style: { fontSize: 28 } },
      ]),
    });
    const found = ids(content.run({ dir, manifest }));
    assert(found.length === 0, `오탐: ${found.join(', ')}`);
  });

  /* ── 유출: 오탐이 가장 위험한 곳 ───────────────────────────── */

  test('해시·색상·base64 이미지를 비밀로 착각하지 않는다', () => {
    const { dir, manifest } = scaffold(
      {
        sources: [
          { id: 's1', title: 'a'.repeat(60), url: 'https://example.com/a', accessedAt: '2026-08-16T00:00:00.000Z' },
        ],
      },
      {
        d: deck([
          { id: 'h', kind: 'body', text: 'sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', box: { x: 0, y: 0, w: 1800, h: 200 }, style: { fontSize: 24 } },
          { id: 'i', kind: 'image', alt: '점', assetId: undefined, box: { x: 0, y: 300, w: 100, h: 100 } },
          { id: 'c', kind: 'code', text: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', box: { x: 0, y: 500, w: 1800, h: 200 }, style: { fontSize: 16 } },
        ]),
      }
    );
    const found = ids(security.run({ dir, manifest }));
    assert(found.length === 0, `오탐: ${found.join(' · ')}`);
  });

  test('공용 계정 이름(runner·root)은 개인 경로로 보지 않는다', () => {
    // CI는 /home/runner에서 돈다. 여기에 경고를 내면 모든 CI 실행이 노랗게 물든다.
    const { dir, manifest } = scaffold({
      sources: [{ id: 's1', title: 'CI 로그', path: '/home/runner/work/design-studio/qa.json', accessedAt: '2026-08-16T00:00:00.000Z' }],
    }, { d: deck([]) });
    assert(!ids(security.run({ dir, manifest })).includes('secret.homePath'), 'CI 경로를 개인 경로로 봤다');
  });

  test('비밀 값을 보고서에 그대로 옮기지 않는다', () => {
    const { dir, manifest } = scaffold({
      brief: { purpose: 'p', audience: 'a', language: 'ko', deliverables: ['deck'], constraints: ['키 AKIAIOSFODNN7EXAMPLE 를 넣어 뒀다'] },
    }, { d: deck([]) });
    const found = security.run({ dir, manifest }).filter((f) => f.check === 'secret.key');
    assert(found.length === 1, `secret.key ${found.length}건`);
    assert(!found[0].message.includes('AKIAIOSFODNN7EXAMPLE'), '보고서가 값을 통째로 다시 적었다 — 두 번째 유출이다');
    assert(found[0].message.includes('…'), '가려진 흔적이 없다');
  });

  /* ── 렌더러와 검사기가 같은 기준을 쓰는가 ──────────────────── */

  test('렌더 결과의 행간이 검사기가 기대하는 값과 같다', () => {
    const ir = {
      schemaVersion: '1.0',
      id: 'd',
      type: 'deck',
      title: 'd',
      canvas: { width: 1920, height: 1080 },
      slides: [
        {
          id: 's1',
          layout: 'statement',
          blocks: [
            { id: 'big', kind: 'heading', text: '큰 제목', box: { x: 100, y: 100, w: 1400, h: 200 }, style: { fontRole: 'display', fontSize: 96 } },
            { id: 'small', kind: 'body', text: '작은 본문', box: { x: 100, y: 400, w: 1000, h: 200 }, style: { fontSize: 24 } },
          ],
        },
      ],
    };
    const html = renderIrFiles(ir, { tokens: {}, lang: 'ko', assetSrc: () => null })[0].html;
    const baseline = bodyBaseline('deck');
    const expectBig = defaultLineHeight('heading', 96, true, baseline);
    const expectSmall = defaultLineHeight('body', 24, true, baseline);
    assert(html.includes(`line-height:${expectBig}`), `대자 행간 ${expectBig}가 HTML에 없다`);
    assert(html.includes(`line-height:${expectSmall}`), `본문 행간 ${expectSmall}가 HTML에 없다`);
    // 한글 대자는 -0.02em까지만. 서문 관례(-0.05em)가 새어 들어오면 여기서 걸린다.
    assert(html.includes('letter-spacing:-0.02em'), '한글 대자 자간이 기대와 다르다');
    assert(!/letter-spacing:-0\.0[3-9]/.test(html), '한글에 -0.03em 이하가 나갔다');
  });

  test('렌더러가 합성 굵게·기울임을 끄고 금칙 처리를 켠다', () => {
    const ir = { schemaVersion: '1.0', id: 'd', type: 'deck', title: 'd', canvas: { width: 1920, height: 1080 }, slides: [{ id: 's1', layout: 'statement', blocks: [] }] };
    const ko = renderIrFiles(ir, { tokens: {}, lang: 'ko', assetSrc: () => null })[0].html;
    const en = renderIrFiles(ir, { tokens: {}, lang: 'en', assetSrc: () => null })[0].html;
    assert(ko.includes('font-synthesis: none'), '합성 금지 선언이 없다');
    assert(ko.includes('line-break: strict'), '한글 금칙 처리가 없다');
    assert(!en.includes('line-break: strict'), '서문에 금칙 처리가 붙었다');
    assert(ko.includes('prefers-reduced-motion'), '움직임 축소 대응이 없다');
  });

  test('언어 판정과 전각 판정이 실제 글자를 본다', () => {
    assert(isCjkLang('ko') && isCjkLang('zh-CN') && isCjkLang('ja'), 'CJK 언어를 놓쳤다');
    assert(!isCjkLang('en') && !isCjkLang('ko-latn-x') === false, '접두 판정이 어긋났다');
    assert(hasCjk('규칙') && hasCjk('\u6F22\u5B57') && hasCjk('かな'), '전각 글자를 놓쳤다');
    assert(!hasCjk('ASCII only 123'), '라틴을 전각으로 봤다');
  });

  /* ── 스키마와 문서가 서로를 가리키는가 ─────────────────────── */

  test('letterSpacing이 스키마에 선언돼 있고 렌더러가 실제로 낸다', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'artifact.schema.json'), 'utf8'));
    const style = schema.$defs.block.properties.style.properties;
    assert(style.letterSpacing, '스키마에 letterSpacing이 없다');
    const ir = {
      schemaVersion: '1.0', id: 'd', type: 'deck', title: 'd', canvas: { width: 1920, height: 1080 },
      slides: [{ id: 's1', layout: 'statement', blocks: [{ id: 'b', kind: 'heading', text: 'A', box: { x: 0, y: 0, w: 500, h: 100 }, style: { fontSize: 40, letterSpacing: 0.12 } }] }],
    };
    const html = renderIrFiles(ir, { tokens: {}, lang: 'ko', assetSrc: () => null })[0].html;
    assert(html.includes('letter-spacing:0.12em'), '선언한 자간이 렌더에 반영되지 않았다');
  });
}
