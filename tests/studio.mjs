/**
 * tests/studio.mjs — 편집기·체크포인트·수정 요청 회귀 (의존성 없음)
 *
 * 브라우저가 필요한 검사(편집기가 실제로 뜨는지, 미리보기가 CLI 출력과 같은지)는
 * tests/golden.mjs에 있다.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleRenderCore, findCollisions, REQUIRED_EXPORTS } from '../scripts/design/lib/studio/bundle.mjs';
import { renderStudio } from '../scripts/design/lib/studio/index.mjs';
import { createCheckpoint, listCheckpoints, findCheckpoint, restoreCheckpoint, diffCheckpoint } from '../scripts/design/lib/checkpoint.mjs';
import { renderIrFiles } from '../scripts/design/lib/render/core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = path.join(ROOT, 'examples', 'design-studio-intro');

function loadCtx(dir) {
  return {
    dir,
    file: path.join(dir, 'design-project.json'),
    manifest: JSON.parse(fs.readFileSync(path.join(dir, 'design-project.json'), 'utf8')),
  };
}

function loadIrs(ctx) {
  const irs = {};
  for (const art of ctx.manifest.artifacts) {
    irs[art.id] = JSON.parse(fs.readFileSync(path.resolve(ctx.dir, art.ir), 'utf8'));
  }
  return irs;
}

function tmpCopy(src, skip = ['out', 'qa.json', 'qa-report.html', '.design']) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'design-studio-'));
  copyDir(src, dest, skip);
  return dest;
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

export function run(test, assert, design, EXIT) {
  /* ── 브라우저 번들 ── */

  test('번들 모듈 사이에 최상위 이름 충돌이 없다', () => {
    const c = findCollisions();
    assert(
      c.length === 0,
      `충돌:\n         ${c.map((x) => `${x.name}: ${x.first} ↔ ${x.second}`).join('\n         ')}\n         공유 도구는 render/shared.mjs로 옮기세요`
    );
  });

  test('번들에 필요한 이름이 모두 들어 있다', () => {
    const src = bundleRenderCore();
    for (const name of REQUIRED_EXPORTS) {
      assert(new RegExp(`(function|const|let|var|class)\\s+${name}\\b`).test(src), `${name}이 번들에 없습니다`);
    }
  });

  test('번들에 import/export 구문이 남아 있지 않다', () => {
    const src = bundleRenderCore();
    assert(!/^import\s/m.test(src), 'import 구문이 남았습니다 (브라우저에서 SyntaxError)');
    assert(!/^export\s/m.test(src), 'export 구문이 남았습니다');
  });

  test('번들이 브라우저에서 문법 오류를 내지 않는다', () => {
    // new Function은 파싱만 해도 문법 오류를 던진다 — 브라우저 파서와 같은 판정
    const src = bundleRenderCore();
    try {
      // eslint-disable-next-line no-new-func
      new Function(src);
    } catch (err) {
      throw new Error(`문법 오류: ${err.message}`);
    }
  });

  /* ── 편집기 HTML ── */

  test('편집기 HTML 안에 살아 있는 </script>가 없다', () => {
    const ctx = loadCtx(EXAMPLE);
    const html = renderStudio(ctx, { artifacts: ctx.manifest.artifacts, irs: loadIrs(ctx) });
    const body = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
    assert(!/<\/script/i.test(body), '스크립트 안에 </script>가 남아 스크립트가 잘립니다');
  });

  test('편집기가 산출물 세 종류를 모두 담는다', () => {
    const ctx = loadCtx(EXAMPLE);
    const html = renderStudio(ctx, { artifacts: ctx.manifest.artifacts, irs: loadIrs(ctx) });
    for (const art of ctx.manifest.artifacts) {
      assert(html.includes(`"${art.id}"`), `${art.id}가 편집기에 없습니다`);
    }
    assert(html.includes('renderIrFiles'), '렌더 코어가 들어 있지 않습니다');
  });

  test('편집기가 자산을 data: URL로 인라인한다', () => {
    const dir = tmpCopy(path.join(ROOT, 'examples', 'whiteboard-intro'));
    const ctx = loadCtx(dir);
    const irs = {};
    for (const art of ctx.manifest.artifacts) {
      const p = path.resolve(dir, art.ir);
      if (fs.existsSync(p)) irs[art.id] = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    if (Object.keys(irs).length === 0) { fs.rmSync(dir, { recursive: true, force: true }); return; }
    const html = renderStudio(ctx, { artifacts: ctx.manifest.artifacts, irs });
    assert(html.includes('data:image/svg+xml;base64,'), '손 이미지가 인라인되지 않았습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /* ── 체크포인트 ── */

  test('체크포인트를 만들고 목록에서 찾는다', () => {
    const dir = tmpCopy(EXAMPLE);
    const ctx = loadCtx(dir);
    const meta = createCheckpoint(ctx, { label: '테스트' });
    const all = listCheckpoints(ctx);
    assert(all.length === 1, `체크포인트 ${all.length}개`);
    assert(all[0].id === meta.id, 'id 불일치');
    assert(Object.keys(meta.files).length === 4, `파일 ${Object.keys(meta.files).length}개 (매니페스트 + IR 3개 기대)`);
    assert(findCheckpoint(ctx, 'last').id === meta.id, 'last를 못 찾음');
    assert(findCheckpoint(ctx, '테스트').id === meta.id, '라벨로 못 찾음');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('복구가 파일을 되돌린다', () => {
    const dir = tmpCopy(EXAMPLE);
    const ctx = loadCtx(dir);
    const meta = createCheckpoint(ctx, { label: '변경 전' });

    const irPath = path.join(dir, 'ir', 'deck.json');
    const before = fs.readFileSync(irPath, 'utf8');
    const ir = JSON.parse(before);
    ir.slides[0].blocks[0].text = '바뀐 제목';
    fs.writeFileSync(irPath, JSON.stringify(ir, null, 2));

    restoreCheckpoint(loadCtx(dir), meta);
    assert(fs.readFileSync(irPath, 'utf8') === before, '복구되지 않았습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('복구가 복구 직전 상태도 남긴다', () => {
    const dir = tmpCopy(EXAMPLE);
    const ctx = loadCtx(dir);
    const meta = createCheckpoint(ctx, { label: '기준' });

    const irPath = path.join(dir, 'ir', 'deck.json');
    const ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
    ir.slides[0].blocks[0].text = '실수로 바꾼 제목';
    fs.writeFileSync(irPath, JSON.stringify(ir, null, 2));

    const { safety } = restoreCheckpoint(loadCtx(dir), meta);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, '.design', 'checkpoints', safety.id, 'ir', 'deck.json'), 'utf8'));
    assert(saved.slides[0].blocks[0].text === '실수로 바꾼 제목', '복구 직전 상태가 남지 않았습니다 — 복구를 되돌릴 수 없습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('차이 비교가 텍스트 변경을 잡는다', () => {
    const dir = tmpCopy(EXAMPLE);
    const ctx = loadCtx(dir);
    const meta = createCheckpoint(ctx, {});

    const irPath = path.join(dir, 'ir', 'deck.json');
    const ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
    ir.slides[0].blocks[0].text = '새 제목';
    fs.writeFileSync(irPath, JSON.stringify(ir, null, 2));

    const changes = diffCheckpoint(loadCtx(dir), meta);
    const hit = changes.find((c) => c.after === '새 제목');
    assert(hit, `텍스트 변경을 못 잡음: ${JSON.stringify(changes.slice(0, 3))}`);
    assert(hit.path.includes('cover'), `경로에 슬라이드 id가 없음: ${hit.path}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('차이 비교가 순서 변경을 잡는다', () => {
    const dir = tmpCopy(EXAMPLE);
    const ctx = loadCtx(dir);
    const meta = createCheckpoint(ctx, {});

    const irPath = path.join(dir, 'ir', 'deck.json');
    const ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
    const tmp = ir.slides[1]; ir.slides[1] = ir.slides[2]; ir.slides[2] = tmp;
    fs.writeFileSync(irPath, JSON.stringify(ir, null, 2));

    const changes = diffCheckpoint(loadCtx(dir), meta);
    assert(changes.some((c) => c.kind === 'reordered'), `순서 변경을 못 잡음: ${JSON.stringify(changes.slice(0, 3))}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('차이 비교가 시각·이력 같은 잡음을 무시한다', () => {
    const dir = tmpCopy(EXAMPLE);
    const ctx = loadCtx(dir);
    const meta = createCheckpoint(ctx, {});

    const f = path.join(dir, 'design-project.json');
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    m.updatedAt = new Date().toISOString();
    m.history = [{ at: new Date().toISOString(), command: 'check', result: 'ok' }];
    m.qa = { status: 'pass', lastRun: new Date().toISOString() };
    fs.writeFileSync(f, JSON.stringify(m, null, 2));

    const changes = diffCheckpoint(loadCtx(dir), meta);
    assert(changes.length === 0, `잡음을 변경으로 봤습니다: ${JSON.stringify(changes)}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /* ── CLI 왕복 ── */

  test('studio가 편집기 파일을 만든다', () => {
    const dir = tmpCopy(EXAMPLE);
    const r = design(['studio'], dir);
    assert(r.code === EXIT.OK, `code=${r.code}\n${r.out}`);
    const out = path.join(dir, 'out', 'studio.html');
    assert(fs.existsSync(out), '편집기 파일이 없습니다');
    assert(fs.statSync(out).size > 40000, '편집기가 너무 작습니다 — 렌더 코어가 빠졌을 수 있습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('studio --apply가 편집 결과를 반영한다', () => {
    const dir = tmpCopy(EXAMPLE);
    const ctx = loadCtx(dir);
    const irs = loadIrs(ctx);
    irs.deck.slides[0].blocks[0].text = '패치로 바꾼 제목';
    fs.writeFileSync(path.join(dir, 'p.json'), JSON.stringify({
      project: ctx.manifest.id, tokens: ctx.manifest.brand.tokens, irs, revisions: [],
    }));

    const r = design(['studio', '--apply', 'p.json'], dir);
    assert(r.code === EXIT.OK, `code=${r.code}\n${r.out}`);
    const after = JSON.parse(fs.readFileSync(path.join(dir, 'ir', 'deck.json'), 'utf8'));
    assert(after.slides[0].blocks[0].text === '패치로 바꾼 제목', '반영되지 않았습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('studio --apply가 반영 전에 체크포인트를 남긴다', () => {
    const dir = tmpCopy(EXAMPLE);
    const ctx = loadCtx(dir);
    const irs = loadIrs(ctx);
    irs.deck.slides[0].blocks[0].text = '바뀐 제목';
    fs.writeFileSync(path.join(dir, 'p.json'), JSON.stringify({ project: ctx.manifest.id, irs }));
    design(['studio', '--apply', 'p.json'], dir);

    const all = listCheckpoints(loadCtx(dir));
    assert(all.length >= 1, '체크포인트가 없습니다');
    const saved = JSON.parse(fs.readFileSync(path.join(dir, '.design', 'checkpoints', all[0].id, 'ir', 'deck.json'), 'utf8'));
    assert(saved.slides[0].blocks[0].text !== '바뀐 제목', '체크포인트가 반영 후 상태를 담았습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('스키마를 어기는 패치는 거부하고 원본을 지킨다', () => {
    const dir = tmpCopy(EXAMPLE);
    const ctx = loadCtx(dir);
    const irs = loadIrs(ctx);
    const before = fs.readFileSync(path.join(dir, 'ir', 'deck.json'), 'utf8');
    irs.deck.slides[0].layout = '존재하지-않는-레이아웃';
    fs.writeFileSync(path.join(dir, 'p.json'), JSON.stringify({ project: ctx.manifest.id, irs }));

    const r = design(['studio', '--apply', 'p.json'], dir);
    assert(r.code === EXIT.SCHEMA_INVALID, `code=${r.code}\n${r.out}`);
    assert(fs.readFileSync(path.join(dir, 'ir', 'deck.json'), 'utf8') === before, '거부했는데 원본이 바뀌었습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('선노출을 만드는 패치는 거부한다', () => {
    const dir = tmpCopy(path.join(ROOT, 'tests', 'fixtures', 'whiteboard'));
    const ctx = loadCtx(dir);
    const irs = { board: JSON.parse(fs.readFileSync(path.join(dir, 'ir', 'board.json'), 'utf8')) };
    delete irs.board.scenes[0].layers[0].protectedRegions;
    fs.writeFileSync(path.join(dir, 'p.json'), JSON.stringify({ project: ctx.manifest.id, irs }));

    const r = design(['studio', '--apply', 'p.json'], dir);
    assert(r.code === EXIT.SCHEMA_INVALID, `code=${r.code}\n${r.out}`);
    assert(r.out.includes('미리 드러납니다'), `메시지 없음:\n${r.out}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('반영하면 렌더된 산출물이 stale로 표시된다', () => {
    const dir = tmpCopy(EXAMPLE);
    design(['render'], dir);
    const ctx = loadCtx(dir);
    const irs = loadIrs(ctx);
    irs.deck.slides[0].blocks[0].text = '또 바꾼 제목';
    fs.writeFileSync(path.join(dir, 'p.json'), JSON.stringify({ project: ctx.manifest.id, irs }));
    design(['studio', '--apply', 'p.json'], dir);

    const after = loadCtx(dir).manifest.artifacts.find((a) => a.id === 'deck');
    assert(after.status === 'stale', `status=${after.status} — 편집 후에도 최신인 것처럼 남았습니다`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /* ── 수정 요청 ── */

  test('수정 요청이 큐에 쌓이고 목록·완료 처리가 된다', () => {
    const dir = tmpCopy(EXAMPLE);
    const ctx = loadCtx(dir);
    fs.writeFileSync(path.join(dir, 'p.json'), JSON.stringify({
      project: ctx.manifest.id,
      irs: {},
      revisions: [{ at: new Date().toISOString(), artifact: 'deck', container: 'cover', block: 'title',
                    instruction: '제목을 더 짧게', status: 'open' }],
    }));
    assert(design(['studio', '--apply', 'p.json'], dir).code === EXIT.OK, '반영 실패');

    const listed = design(['revise', '--json'], dir);
    const items = JSON.parse(listed.out);
    assert(items.length === 1, `요청 ${items.length}건`);
    assert(items[0].id, 'id가 붙지 않았습니다');
    assert(items[0].instruction === '제목을 더 짧게', '지시가 보존되지 않음');

    assert(design(['revise', '--done', 'all'], dir).code === EXIT.OK, '완료 처리 실패');
    assert(JSON.parse(design(['revise', '--json'], dir).out).length === 0, '완료 처리 후에도 남아 있습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('checkpoint CLI 왕복이 성립한다', () => {
    const dir = tmpCopy(EXAMPLE);
    assert(design(['checkpoint', 'create', '--label', '기준점'], dir).code === EXIT.OK, 'create 실패');

    const irPath = path.join(dir, 'ir', 'deck.json');
    const ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
    ir.slides[0].blocks[0].text = '임시 변경';
    fs.writeFileSync(irPath, JSON.stringify(ir, null, 2));

    const diff = design(['checkpoint', 'diff', 'last'], dir);
    assert(diff.out.includes('임시 변경'), `diff에 변경이 안 보임:\n${diff.out}`);

    assert(design(['checkpoint', 'restore', 'last'], dir).code === EXIT.OK, 'restore 실패');
    const restored = JSON.parse(fs.readFileSync(irPath, 'utf8'));
    assert(restored.slides[0].blocks[0].text !== '임시 변경', '복구되지 않았습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('없는 체크포인트를 복구하려 하면 코드 6', () => {
    const dir = tmpCopy(EXAMPLE);
    assert(design(['checkpoint', 'restore', 'nope'], dir).code === EXIT.NOT_FOUND, '엉뚱한 코드');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /* ── 렌더 코어 동등성 (노드 쪽) ── */

  test('렌더 코어가 파일 쓰기 없이도 같은 HTML을 낸다', () => {
    const dir = tmpCopy(EXAMPLE);
    const ctx = loadCtx(dir);
    design(['render'], dir);
    const irs = loadIrs(ctx);
    const files = renderIrFiles(irs.deck, {
      tokens: ctx.manifest.brand.tokens,
      lang: ctx.manifest.brief.language,
      assetSrc: () => null,
    });
    const onDisk = fs.readFileSync(path.join(dir, 'out', 'deck', 'deck.html'), 'utf8');
    assert(files[0].html === onDisk, '순수 코어와 파일 출력이 다릅니다 — 편집기 미리보기가 어긋납니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });
}
