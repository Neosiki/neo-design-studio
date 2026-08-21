#!/usr/bin/env node
/**
 * tests/run.mjs — 의존성 없는 회귀 테스트
 *
 *   node tests/run.mjs
 *
 * 확인하는 것
 *  1. 스키마 검증기가 위반을 실제로 잡는다
 *  2. 실패 픽스처가 기대한 검사 항목을 모두 걸러낸다 (품질 게이트 회귀 방지)
 *  3. 예제 프로젝트는 통과하고 렌더 결과가 재현된다 (골든 해시)
 *  4. 승인 게이트가 없으면 render가 종료 코드 3으로 막힌다
 *  5. CLI 종료 코드 규약이 지켜진다
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validate } from '../scripts/design/lib/schema.mjs';
import { runQa } from '../scripts/design/lib/qa.mjs';
import { EXIT } from '../scripts/design/lib/util.mjs';
import { run as whiteboardTests } from './whiteboard.mjs';
import { run as studioTests } from './studio.mjs';
import { run as apiTests, runAsync as apiAsyncTests } from './api.mjs';
import { run as stylesTests } from './styles.mjs';
import { run as qualityTests } from './quality.mjs';
import { run as p0Tests } from './p0.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'scripts', 'design', 'cli.mjs');

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    const out = fn();
    // 비동기 테스트도 같은 집계를 쓴다
    if (out && typeof out.then === 'function') {
      return out.then(
        () => { passed += 1; console.log(`  ok   ${name}`); },
        (err) => { failures.push({ name, message: err.message }); console.log(`  FAIL ${name}\n         ${err.message}`); }
      );
    }
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log(`  FAIL ${name}\n         ${err.message}`);
  }
  return undefined;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function design(args, cwd) {
  const proc = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  return { code: proc.status, out: `${proc.stdout}${proc.stderr}` };
}

function loadCtx(dir) {
  return {
    dir,
    file: path.join(dir, 'design-project.json'),
    manifest: JSON.parse(fs.readFileSync(path.join(dir, 'design-project.json'), 'utf8')),
  };
}

function checkIds(report) {
  return new Set(report.groups.flatMap((g) => g.findings.map((f) => f.check)));
}

/* ── 1. 스키마 검증기 ──────────────────────────────────────────── */

console.log('\n스키마 검증기');

const projectSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'project.schema.json'), 'utf8'));
const artifactSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'artifact.schema.json'), 'utf8'));

test('필수 항목 누락을 잡는다', () => {
  const r = validate({ schemaVersion: '1.0' }, projectSchema);
  assert(!r.valid, '통과하면 안 됨');
  assert(r.errors.some((e) => e.message.includes("'id'")), `id 누락 미검출: ${JSON.stringify(r.errors)}`);
});

test('허용값 밖의 enum을 잡는다', () => {
  const r = validate(
    { schemaVersion: '1.0', id: 'x', type: 'hologram', pages: [] },
    artifactSchema
  );
  assert(!r.valid, '통과하면 안 됨');
});

test('additionalProperties=false를 지킨다', () => {
  const r = validate({ purpose: 'a', audience: 'b', language: 'ko', deliverables: ['html'], 몰래: 1 }, projectSchema.$defs.brief);
  assert(!r.valid, '모르는 항목을 통과시키면 안 됨');
});

test('패턴 위반을 잡는다', () => {
  const r = validate({ ...minimalManifest(), id: 'Bad_ID' }, projectSchema);
  assert(!r.valid, 'id 패턴 위반을 통과시키면 안 됨');
});

test('if/then 분기: deck에는 slides가 필요하다', () => {
  const r = validate({ schemaVersion: '1.0', id: 'd', type: 'deck', canvas: { width: 1, height: 1 } }, artifactSchema);
  assert(!r.valid, 'slides 없는 deck을 통과시키면 안 됨');
});

test('올바른 매니페스트는 통과한다', () => {
  const r = validate(minimalManifest(), projectSchema);
  assert(r.valid, `실패함: ${JSON.stringify(r.errors)}`);
});

/* ── 2. 품질 게이트 회귀 ───────────────────────────────────────── */

console.log('\n품질 게이트 (실패 픽스처)');

const failingDir = path.join(ROOT, 'tests', 'fixtures', 'failing-project');
const failingReport = runQa(loadCtx(failingDir));
const found = checkIds(failingReport);

const MUST_CATCH = [
  'color.contrast',      // fg/bg 대비 미달
  'type.fallback',       // 폰트 폴백 없음
  'type.scale',          // 9px 스케일
  'type.minSize',        // 10px 본문
  'layout.overflow',     // 상자를 넘는 제목
  'layout.overlap',      // 겹치는 블록
  'layout.canvas',       // 캔버스 밖
  'layout.safeArea',     // 안전영역 이탈
  'source.unlinked',     // 출처 없는 수치
  'ref.source',          // 없는 sourceId 참조
  'ref.asset',           // 없는 assetId 참조
  'asset.missing',       // 파일 없는 자산
  'asset.origin',        // origin: unknown
  'asset.license',       // 라이선스 없음
  'style.candidates',    // 삼방향 증거 부족
  'style.chosen',        // 선택 표시 없음
  'reference.empty',     // 잠근 레퍼런스 없음
  'video.overlap',       // 장면 겹침
  'video.gap',           // 장면 공백
  'video.tooShort',      // 0.5초 장면
  'video.tooLong',       // 15초 장면
  'video.layerTiming',   // 장면 밖 enterMs
  'video.regionBounds',  // 캔버스 밖 영역
  'audio.balance',       // BGM이 보이스오버를 덮음
  'audio.missing',       // 오디오 파일 없음
  'output.missing',      // 기록된 산출물 없음
  'a11y.alt.block',      // alt 없는 이미지

  // 조판 (references/typography.md)
  'type.genericFallback',// 총칭 계열로 끝나지 않는 폴백 사슬
  'type.systemOnly',     // 총칭 계열 하나뿐
  'type.cjkFallback',    // 한글 내용인데 CJK 글꼴 없음
  'type.latinFirst',     // 라틴 글꼴이 CJK 글꼴 뒤에
  'type.overusedFont',   // display에 Inter
  'type.scaleSteps',     // 8단 음계
  'type.scaleRatio',     // 비율이 1.14배~3.0배
  'type.weightSynthesis',// 싣지 않은 굵기
  'type.tracking',       // 한글에 음수 자간
  'type.lineHeight',     // 한글 본문 행간 1.0
  'type.measure',        // 한 줄 90자
  'type.headingSize',    // 발표 제목 30px
  'type.quotes',         // 곧은 따옴표

  // 접근성
  'a11y.langMismatch',   // lang=en에 한글 본문
  'a11y.motion',         // expressive + 1400ms
  'a11y.altQuality',     // alt이 '로고'
  'a11y.decorativeAlt',  // 장식 도형에 alt
  'a11y.headingOrder',   // h2가 h1보다 먼저
  'a11y.headingMissing', // 제목 없는 슬라이드
  'a11y.readingOrder',   // 배열 순서 ≠ 화면 순서
  'a11y.captions',       // 보이스오버에 자막 없음
  'a11y.subtitleRate',   // 초당 24자 자막

  // 내용
  'content.placeholder', // init 자리표시자가 남음
  'content.filler',      // lorem ipsum

  // 유출
  'secret.key',          // 매니페스트 안의 AWS 키
  'secret.output',       // 산출물 안의 OpenAI 키
  'secret.file',         // .env를 자산으로 등록
  'secret.homePath',     // C:\\Users\\<이름> 절대 경로
  'secret.privateHost',  // 출처가 localhost
];

for (const id of MUST_CATCH) {
  test(`${id} 를 잡는다`, () => {
    assert(found.has(id), `검출되지 않음. 실제 검출: ${[...found].sort().join(', ')}`);
  });
}

test('실패 픽스처의 종합 판정은 fail 이다', () => {
  assert(failingReport.status === 'fail', `status=${failingReport.status}`);
  assert(failingReport.summary.errors > 0, '오류가 0건이면 안 됨');
});

/* ── 3. 예제 프로젝트 ─────────────────────────────────────────── */

console.log('\n예제 프로젝트');

const exampleDir = path.join(ROOT, 'examples', 'design-studio-intro');

test('예제는 검수를 통과한다 (경고 0)', () => {
  const report = runQa(loadCtx(exampleDir));
  const detail = report.groups
    .flatMap((g) => g.findings)
    .map((f) => `${f.level} ${f.check} @ ${f.where}`)
    .join('\n         ');
  assert(report.summary.errors === 0, `오류 ${report.summary.errors}건:\n         ${detail}`);
  assert(report.summary.warnings === 0, `경고 ${report.summary.warnings}건:\n         ${detail}`);
});

test('예제 렌더 결과가 재현된다 (골든 해시)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-golden-'));
  copyDir(exampleDir, tmp, ['out', 'qa.json', 'qa-report.html']);

  const first = design(['render', '--out', 'out'], tmp);
  assert(first.code === EXIT.OK, `1차 렌더 실패(code=${first.code}):\n${first.out}`);
  const h1 = hashTree(path.join(tmp, 'out'));

  const second = design(['render', '--out', 'out', '--force'], tmp);
  assert(second.code === EXIT.OK, `2차 렌더 실패(code=${second.code}):\n${second.out}`);
  const h2 = hashTree(path.join(tmp, 'out'));

  assert(h1 === h2, `같은 IR인데 결과가 다릅니다.\n  1차 ${h1}\n  2차 ${h2}`);
  assert(Object.keys(h1).length !== 0, '렌더 결과가 비어 있음');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('변경 없는 산출물은 다시 렌더하지 않는다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-cache-'));
  copyDir(exampleDir, tmp, ['out', 'qa.json', 'qa-report.html']);
  design(['render'], tmp);
  const again = design(['render'], tmp);
  assert(again.out.includes('건너뜁니다'), `캐시가 동작하지 않음:\n${again.out}`);
  fs.rmSync(tmp, { recursive: true, force: true });
});

/* ── 4. 게이트와 종료 코드 ─────────────────────────────────────── */

console.log('\n승인 게이트 · 종료 코드');

test('init → plan → build 왕복이 성립한다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-init-'));
  assert(design(['init', '--name', '테스트', '--id', 'tt', '--deliverables', 'html,deck'], tmp).code === EXIT.OK, 'init 실패');
  assert(design(['plan'], tmp).code === EXIT.OK, 'plan 실패');
  assert(fs.existsSync(path.join(tmp, 'ir', 'html-main.json')), 'IR이 생성되지 않음');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('direction 미승인 상태의 build는 코드 3으로 막힌다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-gate-'));
  design(['init', '--name', '게이트', '--id', 'gg'], tmp);
  design(['plan'], tmp);
  const r = design(['build'], tmp);
  assert(r.code === EXIT.GATE_BLOCKED, `code=${r.code} (기대 ${EXIT.GATE_BLOCKED})\n${r.out}`);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('삼방향 증거 없는 direction 승인은 거부된다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-three-'));
  design(['init', '--name', '삼방향', '--id', 'th'], tmp);
  const r = design(['approve', 'direction', '--note', '그냥'], tmp);
  assert(r.code === EXIT.GATE_BLOCKED, `code=${r.code}\n${r.out}`);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('사유 없는 면제(--waive)는 거부된다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-waive-'));
  design(['init', '--name', '면제', '--id', 'wv'], tmp);
  const r = design(['approve', 'direction', '--waive'], tmp);
  assert(r.code === EXIT.USAGE, `code=${r.code}\n${r.out}`);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('검수 실패는 종료 코드 4로 끝난다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-qa-'));
  copyDir(failingDir, tmp, []);
  const r = design(['check'], tmp);
  assert(r.code === EXIT.QA_FAILED, `code=${r.code} (기대 ${EXIT.QA_FAILED})`);
  assert(fs.existsSync(path.join(tmp, 'qa.json')), 'qa.json 미생성');
  assert(fs.existsSync(path.join(tmp, 'qa-report.html')), 'qa-report.html 미생성');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('--strict 는 경고도 실패로 처리한다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-strict-'));
  copyDir(exampleDir, tmp, ['out', 'qa.json', 'qa-report.html']);
  // 경고 하나를 일부러 심는다: 잠기지 않은 레퍼런스
  const f = path.join(tmp, 'design-project.json');
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  m.references[0].locked = false;
  fs.writeFileSync(f, JSON.stringify(m, null, 2));
  assert(design(['check'], tmp).code === EXIT.OK, '경고만 있을 때 기본 모드는 통과해야 함');
  assert(design(['check', '--strict'], tmp).code === EXIT.QA_FAILED, 'strict에서 경고가 실패로 처리되지 않음');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('알 수 없는 명령은 코드 1로 끝난다', () => {
  const r = design(['하늘을날다'], ROOT);
  assert(r.code === EXIT.USAGE, `code=${r.code}`);
});

test('프로젝트가 없으면 코드 6으로 끝난다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-none-'));
  const r = design(['build'], tmp);
  assert(r.code === EXIT.NOT_FOUND, `code=${r.code}\n${r.out}`);
  fs.rmSync(tmp, { recursive: true, force: true });
});

/* ── 5. whiteboard 플러그인 ───────────────────────────────────── */

console.log('\nwhiteboard 플러그인');
whiteboardTests(test, assert);

console.log('\nwhiteboard CLI');

test('whiteboard plan이 SRT에서 IR을 만든다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-wb-'));
  design(['init', '--name', '보드', '--id', 'bd', '--deliverables', 'video'], tmp);
  fs.writeFileSync(
    path.join(tmp, 'n.srt'),
    '1\n00:00:00,000 --> 00:00:06,000\n첫 문장입니다.\n\n2\n00:00:06,200 --> 00:00:12,000\n하지만 둘째 문장도 있습니다.\n'
  );
  const r = design(['whiteboard', 'plan', 'n.srt', '--artifact', 'wb', '--target', '6', '--min', '4', '--max', '10'], tmp);
  assert(r.code === EXIT.OK, `code=${r.code}\n${r.out}`);
  const ir = JSON.parse(fs.readFileSync(path.join(tmp, 'ir', 'wb.json'), 'utf8'));
  assert(ir.scenes.length >= 1, '장면이 없습니다');
  assert(ir.scenes[0].layers[0].render.plugin === 'whiteboard', 'whiteboard 레이어가 아님');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('whiteboard verify가 픽스처를 통과시킨다', () => {
  const r = design(['whiteboard', 'verify'], path.join(ROOT, 'tests', 'fixtures', 'whiteboard'));
  assert(r.code === EXIT.OK, `code=${r.code}\n${r.out}`);
  assert(r.out.includes('선노출 검사 통과'), `선노출 검사 결과 없음:\n${r.out}`);
});

test('whiteboard verify가 선노출을 종료 코드 4로 막는다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-leak-'));
  copyDir(path.join(ROOT, 'tests', 'fixtures', 'whiteboard'), tmp, ['out']);
  const irPath = path.join(tmp, 'ir', 'board.json');
  const ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
  delete ir.scenes[0].layers[0].protectedRegions;   // 보호 선언을 지운다
  fs.writeFileSync(irPath, JSON.stringify(ir, null, 2));
  const r = design(['whiteboard', 'verify'], tmp);
  assert(r.code === EXIT.QA_FAILED, `code=${r.code} (기대 ${EXIT.QA_FAILED})\n${r.out}`);
  assert(r.out.includes('미리 드러납니다'), `메시지 없음:\n${r.out}`);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('annotate --apply가 검사에 걸리면 원본을 지킨다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-apply-'));
  copyDir(path.join(ROOT, 'tests', 'fixtures', 'whiteboard'), tmp, ['out']);
  const irPath = path.join(tmp, 'ir', 'board.json');
  const before = fs.readFileSync(irPath, 'utf8');
  const bad = JSON.parse(before);
  bad.scenes[0].layers[0].region = { x: 5000, y: 5000, w: 400, h: 400 };  // 캔버스 밖
  fs.writeFileSync(path.join(tmp, 'patch.json'), JSON.stringify({ id: 'board', canvas: bad.canvas, scenes: bad.scenes }));
  const r = design(['whiteboard', 'annotate', '--apply', 'patch.json'], tmp);
  assert(r.code !== EXIT.OK, `실패해야 하는데 통과함:\n${r.out}`);
  assert(fs.readFileSync(irPath, 'utf8') === before, '검사에 걸렸는데 원본이 바뀌었습니다');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('annotate --apply가 정상 편집을 반영하고 보호 영역을 다시 계산한다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-apply2-'));
  copyDir(path.join(ROOT, 'tests', 'fixtures', 'whiteboard'), tmp, ['out']);
  const irPath = path.join(tmp, 'ir', 'board.json');
  const doc = JSON.parse(fs.readFileSync(irPath, 'utf8'));
  // 겹치지 않는 자리로 옮기면 보호 영역이 사라져야 한다
  doc.scenes[0].layers[1].region = { x: 1000, y: 60, w: 800, h: 60 };
  doc.scenes[0].layers[1].render.art.text.fontSize = 40;
  delete doc.scenes[0].layers[0].protectedRegions;
  fs.writeFileSync(path.join(tmp, 'patch.json'), JSON.stringify({ id: 'board', canvas: doc.canvas, scenes: doc.scenes }));
  const r = design(['whiteboard', 'annotate', '--apply', 'patch.json'], tmp);
  assert(r.code === EXIT.OK, `code=${r.code}\n${r.out}`);
  const after = JSON.parse(fs.readFileSync(irPath, 'utf8'));
  assert(!after.scenes[0].layers[0].protectedRegions, '겹치지 않는데 보호 영역이 남았습니다');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('whiteboard render가 믹싱 계획과 스크립트를 남긴다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-mix-'));
  copyDir(path.join(ROOT, 'tests', 'fixtures', 'whiteboard'), tmp, ['out']);
  const r = design(['whiteboard', 'render'], tmp);
  assert(r.code === EXIT.OK, `code=${r.code}\n${r.out}`);
  assert(fs.existsSync(path.join(tmp, 'out', 'board', 'mix.sh')), 'mix.sh 없음');
  assert(fs.existsSync(path.join(tmp, 'out', 'board', 'mix-plan.json')), 'mix-plan.json 없음');
  const plan = JSON.parse(fs.readFileSync(path.join(tmp, 'out', 'board', 'mix-plan.json'), 'utf8'));
  assert(plan.targets.length >= 2, `출력 대상 ${plan.targets.length}개 — 무음본과 최종본이 모두 있어야 함`);
  fs.rmSync(tmp, { recursive: true, force: true });
});

/* ── 6. Studio 편집기 · 체크포인트 ─────────────────────────────── */

function studioSection() {
  console.log('\nStudio · 체크포인트');
  studioTests(test, assert, design, EXIT);
}

test('whiteboard render도 승인 게이트를 지킨다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-wbgate-'));
  copyDir(path.join(ROOT, 'tests', 'fixtures', 'whiteboard'), tmp, ['out']);
  const f = path.join(tmp, 'design-project.json');
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  m.approvals.outline = { state: 'pending' };
  fs.writeFileSync(f, JSON.stringify(m, null, 2));
  const r = design(['whiteboard', 'render'], tmp);
  assert(r.code === EXIT.GATE_BLOCKED, `code=${r.code} (기대 ${EXIT.GATE_BLOCKED})\n${r.out}`);
  fs.rmSync(tmp, { recursive: true, force: true });
});

studioSection();

console.log('\n조판 · 접근성 · 유출');
qualityTests(test, assert);

console.log('\n스타일 레지스트리');
stylesTests(test, assert, design);

p0Tests(test, assert);

console.log('\nMCP · REST · revise 연산');
apiTests(test, assert);

console.log('\nREST 서버');
await apiAsyncTests(test, assert);

/* ── 결과 ─────────────────────────────────────────────────────── */

console.log(`\n${passed}개 통과 · ${failures.length}개 실패`);
if (failures.length) {
  console.log('');
  for (const f of failures) console.log(`✖ ${f.name}\n  ${f.message}`);
  process.exit(1);
}
process.exit(0);

/* ── 보조 ─────────────────────────────────────────────────────── */

function minimalManifest() {
  return {
    schemaVersion: '1.0',
    id: 'ok',
    name: '최소',
    brief: { purpose: 'p', audience: 'a', language: 'ko', deliverables: ['html'] },
    brand: { name: 'b', tokens: { color: { bg: '#000', fg: '#fff', accent: '#00f' }, typography: { display: { family: 'A' }, body: { family: 'B' } } } },
    approvals: { direction: { state: 'pending' } },
    artifacts: [],
  };
}

function copyDir(src, dest, skip) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to, skip);
    else fs.copyFileSync(from, to);
  }
}

function hashTree(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  const walk = (d, prefix) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(d, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, rel);
      else out[rel] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    }
  };
  walk(dir, '');
  return JSON.stringify(out);
}
