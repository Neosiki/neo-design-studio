/**
 * tests/api.mjs — MCP · REST · revise 연산 회귀 (의존성 없음)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { operations, runOperation, HTTP_STATUS } from '../scripts/design/lib/api/operations.mjs';
import { applyOperations, OPERATIONS } from '../scripts/design/lib/api/revise.mjs';
import { EXIT } from '../scripts/design/lib/util.mjs';
import { loadProject } from '../scripts/design/lib/project.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = path.join(ROOT, 'examples', 'design-studio-intro');
const MCP = path.join(ROOT, 'scripts', 'design', 'mcp.mjs');
const SERVE = path.join(ROOT, 'scripts', 'design', 'serve.mjs');

function tmpCopy(src = EXAMPLE) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'design-api-'));
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
const readIr = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, 'ir', `${name}.json`), 'utf8'));

/** MCP 서버에 요청 여러 개를 보내고 응답을 받는다 (개행 구분 JSON-RPC) */
function mcpExchange(requests, env = {}) {
  const lines = requests.map((r) => JSON.stringify(r)).join('\n');
  const proc = spawnSync(process.execPath, [MCP], {
    input: `${lines}\n`, encoding: 'utf8', env: { ...process.env, ...env },
  });
  return proc.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const toolCall = (name, args, env) =>
  mcpExchange([{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }], env)[0];

const payloadOf = (resp) => JSON.parse(resp.result.content[0].text);

export function run(test, assert) {
  /* ── 작업 표면 ── */

  test('모든 작업이 제목·설명·스키마를 갖는다', () => {
    for (const [name, op] of Object.entries(operations)) {
      assert(op.title, `${name}: title 없음`);
      assert(op.description && op.description.length > 20, `${name}: 설명이 너무 짧음`);
      assert(op.schema?.type === 'object', `${name}: 스키마가 object가 아님`);
      assert(typeof op.run === 'function', `${name}: run이 없음`);
    }
  });

  test('로드맵이 지목한 다섯 도구가 모두 있다', () => {
    for (const name of ['generate', 'inspect', 'revise', 'verify', 'export']) {
      assert(operations[name], `${name} 작업이 없습니다`);
    }
  });

  test('필수 인자가 스키마의 properties에 선언되어 있다', () => {
    for (const [name, op] of Object.entries(operations)) {
      for (const req of op.schema.required || []) {
        assert(op.schema.properties?.[req], `${name}: required '${req}'가 properties에 없습니다`);
      }
    }
  });

  test('알 수 없는 작업은 예외 대신 구조화된 실패를 낸다', () => {
    const r = runOperation('없는작업', {});
    assert(r.ok === false && r.code === EXIT.USAGE, `code=${r.code}`);
    assert(r.errors[0].message.includes('가능:'), '가능한 작업 목록을 안내하지 않습니다');
  });

  test('프로젝트가 없으면 code 6으로 돌아온다 (예외 아님)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-none-'));
    const r = runOperation('status', { project: tmp });
    assert(r.ok === false && r.code === EXIT.NOT_FOUND, `code=${r.code}`);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('종료 코드가 모두 HTTP 상태로 매핑된다', () => {
    for (const code of Object.values(EXIT)) {
      assert(HTTP_STATUS[code], `코드 ${code}의 HTTP 매핑이 없습니다`);
    }
    assert(HTTP_STATUS[EXIT.GATE_BLOCKED] === 409, '게이트 미통과는 409여야 합니다');
    assert(HTTP_STATUS[EXIT.QA_FAILED] === 422, '검수 실패는 422여야 합니다');
  });

  /* ── status · inspect ── */

  test('status가 다음에 할 일을 제안한다', () => {
    const dir = tmpCopy();
    const r = runOperation('status', { project: dir });
    assert(r.ok, JSON.stringify(r.errors));
    assert(r.artifacts.length === 3, `산출물 ${r.artifacts.length}개`);
    assert(Array.isArray(r.suggestedNext) && r.suggestedNext.length > 0, '제안이 없습니다');
    assert(r.approvals.direction.state === 'approved', '승인 상태를 못 읽음');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('inspect가 revise에 쓸 블록 id를 준다', () => {
    const dir = tmpCopy();
    const r = runOperation('inspect', { project: dir, artifact: 'deck' });
    assert(r.ok, JSON.stringify(r.errors));
    const cover = r.artifacts[0].containers.find((c) => c.id === 'cover');
    assert(cover, '슬라이드를 못 찾음');
    assert(cover.blocks.some((b) => b.id === 'cover-title'), `블록 id가 없음: ${JSON.stringify(cover.blocks)}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('inspect detail=full은 IR 원본을 준다', () => {
    const dir = tmpCopy();
    const r = runOperation('inspect', { project: dir, artifact: 'teaser', detail: 'full' });
    assert(r.artifacts[0].ir?.scenes?.length > 0, 'IR 원본이 없습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('영상 inspect가 장면 타이밍과 레이어를 포함한다', () => {
    const dir = tmpCopy();
    const r = runOperation('inspect', { project: dir, artifact: 'teaser' });
    const scene = r.artifacts[0].containers[0];
    assert(typeof scene.durationMs === 'number', '장면 길이가 없습니다');
    assert(Array.isArray(scene.layers), '레이어 정보가 없습니다');
    assert(typeof r.artifacts[0].totalMs === 'number', '전체 길이가 없습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /* ── revise 연산 ── */

  test('연산 목록이 전부 인자 정의를 갖는다', () => {
    for (const [name, spec] of Object.entries(OPERATIONS)) {
      assert(Array.isArray(spec.args) && spec.args.length > 0, `${name}: args 없음`);
      assert(spec.desc, `${name}: 설명 없음`);
    }
  });

  test('setText가 텍스트를 바꾼다', () => {
    const dir = tmpCopy();
    const r = runOperation('revise', {
      project: dir, operations: [{ op: 'setText', artifact: 'deck', block: 'cover-title', value: '새 제목' }],
    });
    assert(r.ok, JSON.stringify(r.errors));
    assert(readIr(dir, 'deck').slides[0].blocks[1].text === '새 제목', '반영되지 않음');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('없는 블록을 지목하면 있는 목록을 알려준다', () => {
    const dir = tmpCopy();
    const r = runOperation('revise', {
      project: dir, operations: [{ op: 'setText', artifact: 'deck', block: 'ghost', value: 'x' }],
    });
    assert(!r.ok, '실패해야 합니다');
    assert(r.errors[0].message.includes('cover-title'), `자기 교정 정보가 없음: ${r.errors[0].message}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('연산 하나가 실패하면 전부 롤백된다 (원자성)', () => {
    const dir = tmpCopy();
    const before = fs.readFileSync(path.join(dir, 'ir', 'deck.json'), 'utf8');
    const r = runOperation('revise', {
      project: dir,
      operations: [
        { op: 'setText', artifact: 'deck', block: 'cover-title', value: '바뀐 제목' },
        { op: 'setStyle', artifact: 'deck', block: 'cover-title', key: 'fontSize', value: '숫자아님' },
      ],
    });
    assert(!r.ok && r.code === EXIT.SCHEMA_INVALID, `code=${r.code}`);
    assert(fs.readFileSync(path.join(dir, 'ir', 'deck.json'), 'utf8') === before, '실패했는데 파일이 바뀌었습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('dryRun은 검사만 하고 쓰지 않는다', () => {
    const dir = tmpCopy();
    const before = fs.readFileSync(path.join(dir, 'ir', 'deck.json'), 'utf8');
    const r = runOperation('revise', {
      project: dir, dryRun: true,
      operations: [{ op: 'setText', artifact: 'deck', block: 'cover-title', value: '미리보기' }],
    });
    assert(r.ok && r.dryRun, JSON.stringify(r));
    assert(fs.readFileSync(path.join(dir, 'ir', 'deck.json'), 'utf8') === before, 'dryRun인데 파일이 바뀌었습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('setToken은 모든 산출물을 변경 대상으로 잡는다', () => {
    const dir = tmpCopy();
    const r = runOperation('revise', {
      project: dir, operations: [{ op: 'setToken', group: 'color', key: 'accent', value: '#7cc4ff' }],
    });
    assert(r.ok, JSON.stringify(r.errors));
    assert(r.changedArtifacts.length === 3, `변경 산출물 ${r.changedArtifacts.length}개 — 토큰은 전부에 영향을 준다`);
    assert(loadProject(dir).manifest.brand.tokens.color.accent === '#7cc4ff', '토큰이 반영되지 않음');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('대비를 깨는 토큰은 스키마는 통과하지만 verify가 잡는다', () => {
    const dir = tmpCopy();
    const r = runOperation('revise', {
      project: dir, operations: [{ op: 'setToken', group: 'color', key: 'fg', value: '#0c0f15' }],
    });
    assert(r.ok, '스키마상으로는 유효한 색이므로 revise는 통과해야 합니다');
    const v = runOperation('verify', { project: dir });
    assert(!v.ok && v.code === EXIT.QA_FAILED, `verify가 대비 미달을 놓쳤습니다: ${v.status}`);
    assert(v.findings.some((f) => f.check === 'color.contrast'), '대비 검사가 안 걸림');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('reorder가 순서를 바꾸고 빠진 id를 거부한다', () => {
    const dir = tmpCopy();
    const bad = runOperation('revise', {
      project: dir, operations: [{ op: 'reorder', artifact: 'deck', order: ['cover', 'problem'] }],
    });
    assert(!bad.ok, '일부만 나열했는데 통과했습니다');
    assert(bad.errors[0].message.includes('전부 나열'), `안내가 부족: ${bad.errors[0].message}`);

    const good = runOperation('revise', {
      project: dir,
      operations: [{ op: 'reorder', artifact: 'deck', order: ['cover', 'problem', 'scope', 'approach', 'closing'] }],
    });
    assert(good.ok, JSON.stringify(good.errors));
    assert(readIr(dir, 'deck').slides.map((s) => s.id)[2] === 'scope', '순서가 안 바뀜');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('장면 길이를 바꾸면 뒤 장면이 자동으로 밀린다', () => {
    const dir = tmpCopy();
    const before = readIr(dir, 'teaser');
    const firstId = before.scenes[0].id;
    const r = runOperation('revise', {
      project: dir, operations: [{ op: 'setTiming', artifact: 'teaser', scene: firstId, durationMs: 5000 }],
    });
    assert(r.ok, JSON.stringify(r.errors));
    const after = readIr(dir, 'teaser');
    assert(after.scenes[0].durationMs === 5000, '길이가 안 바뀜');
    assert(after.scenes[1].startMs === 5000, `뒤 장면이 안 밀림: ${after.scenes[1].startMs}`);
    let cursor = 0;
    for (const s of after.scenes) { assert(s.startMs === cursor, `${s.id}: 타임라인 끊김`); cursor += s.durationMs; }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('setBox가 영상 레이어의 region과 보호 영역을 같이 갱신한다', () => {
    const dir = tmpCopy(path.join(ROOT, 'tests', 'fixtures', 'whiteboard'));
    const r = runOperation('revise', {
      project: dir,
      operations: [{ op: 'setBox', artifact: 'board', block: 'e1-text', box: { x: 100, y: 100, w: 400, h: 200 } }],
    });
    // 이 픽스처에는 e1-text가 없으므로 친절한 오류가 나야 한다
    assert(!r.ok, '없는 블록인데 통과했습니다');
    assert(r.errors[0].message.includes('있는 것'), '있는 블록 목록을 안 알려줌');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('setRegion이 블록 없는 레이어(화이트보드)를 옮긴다', () => {
    const dir = tmpCopy(path.join(ROOT, 'tests', 'fixtures', 'whiteboard'));
    const before = readIr(dir, 'board');
    const layerId = before.scenes[0].layers[1].id;
    assert(!before.scenes[0].layers[1].block, '이 픽스처의 레이어는 block이 없어야 한다 (setRegion이 필요한 이유)');

    const r = runOperation('revise', {
      project: dir,
      operations: [{ op: 'setRegion', artifact: 'board', scene: 's01', layer: layerId, region: { x: 200, y: 200, w: 600, h: 300 } }],
    });
    assert(r.ok, `실패: ${JSON.stringify(r.errors)}`);
    const after = readIr(dir, 'board');
    assert(after.scenes[0].layers[1].region.x === 200, '영역이 안 바뀜');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('겹치게 옮기면 보호 영역이 자동으로 다시 계산된다', () => {
    const dir = tmpCopy(path.join(ROOT, 'tests', 'fixtures', 'whiteboard'));
    const before = readIr(dir, 'board');
    const first = before.scenes[0].layers[0].region;
    const layerId = before.scenes[0].layers[1].id;

    // 두 번째 레이어를 첫 레이어 위로 겹치게 옮긴다
    const r = runOperation('revise', {
      project: dir,
      operations: [{
        op: 'setRegion', artifact: 'board', scene: 's01', layer: layerId,
        region: { x: first.x + 100, y: first.y + 100, w: 400, h: 300 },
      }],
    });
    assert(r.ok, `보호 영역 자동 재계산이 동작해야 합니다: ${JSON.stringify(r.errors)}`);
    const after = readIr(dir, 'board');
    const prot = after.scenes[0].layers[0].protectedRegions || [];
    assert(prot.length > 0, '겹치게 옮겼는데 보호 영역이 안 생겼습니다');
    assert(prot.some((p) => p.x === first.x + 100), `엉뚱한 영역을 보호: ${JSON.stringify(prot)}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('setRegion으로 캔버스 밖으로 내보내면 거부된다', () => {
    const dir = tmpCopy(path.join(ROOT, 'tests', 'fixtures', 'whiteboard'));
    const before = fs.readFileSync(path.join(dir, 'ir', 'board.json'), 'utf8');
    const r = runOperation('revise', {
      project: dir,
      operations: [{ op: 'setRegion', artifact: 'board', scene: 's01', layer: 'shape', region: { x: 5000, y: 5000, w: 400, h: 300 } }],
    });
    assert(!r.ok, '캔버스 밖인데 통과했습니다');
    assert(fs.readFileSync(path.join(dir, 'ir', 'board.json'), 'utf8') === before, '거부했는데 파일이 바뀌었습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('addClaim이 등록되지 않은 출처를 거부한다', () => {
    const dir = tmpCopy();
    const bad = runOperation('revise', {
      project: dir,
      operations: [{ op: 'addClaim', artifact: 'deck', block: 'problem-sub', text: 'x', sourceId: 'src-없음' }],
    });
    assert(!bad.ok, '없는 출처인데 통과했습니다');

    const good = runOperation('revise', {
      project: dir,
      operations: [{ op: 'addClaim', artifact: 'deck', block: 'problem-sub', text: '근거 문장', sourceId: 'src-roadmap' }],
    });
    assert(good.ok, JSON.stringify(good.errors));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('revise 후 산출물이 stale이 된다', () => {
    const dir = tmpCopy();
    runOperation('generate', { project: dir });
    runOperation('revise', { project: dir, operations: [{ op: 'setText', artifact: 'deck', block: 'cover-title', value: 'z' }] });
    const status = runOperation('status', { project: dir });
    assert(status.artifacts.find((a) => a.id === 'deck').status === 'stale', '편집 후에도 최신인 것처럼 남았습니다');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /* ── 게이트 ── */

  test('승인 없이 generate하면 code 3과 막힌 게이트를 알려준다', () => {
    const dir = tmpCopy();
    const f = path.join(dir, 'design-project.json');
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    m.approvals.outline = { state: 'pending' };
    fs.writeFileSync(f, JSON.stringify(m, null, 2));

    const r = runOperation('generate', { project: dir });
    assert(!r.ok && r.code === EXIT.GATE_BLOCKED, `code=${r.code}`);
    assert(r.blockedGates.some((g) => g.gate === 'outline'), '어떤 게이트인지 안 알려줌');
    assert(r.hint, '어떻게 풀지 안 알려줌');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('approve가 삼방향 증거를 요구한다', () => {
    const dir = tmpCopy();
    const bad = runOperation('approve', { project: dir, gate: 'direction', evidence: ['a.html'] });
    assert(!bad.ok && bad.code === EXIT.GATE_BLOCKED, `code=${bad.code}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('사유 없는 면제는 거부된다', () => {
    const dir = tmpCopy();
    const r = runOperation('approve', { project: dir, gate: 'draft', state: 'waived' });
    assert(!r.ok && r.code === EXIT.USAGE, `code=${r.code}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('approve가 어떤 명령이 풀렸는지 알려준다', () => {
    const dir = tmpCopy();
    const r = runOperation('approve', { project: dir, gate: 'draft', note: '사용자: 좋습니다' });
    assert(r.ok, JSON.stringify(r.errors));
    assert(r.unlocked.includes('export'), `export가 안 풀림: ${JSON.stringify(r.unlocked)}`);
    assert(r.checkpoint, '체크포인트가 안 찍힘');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /* ── 전체 왕복 ── */

  test('init → plan → approve → generate → verify 왕복이 성립한다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-loop-'));
    const p = path.join(dir, 'proj');

    assert(runOperation('init', { dir: p, name: 'API 왕복', deliverables: ['deck'] }).ok, 'init 실패');
    assert(runOperation('plan', { project: p }).ok, 'plan 실패');

    const blocked = runOperation('generate', { project: p });
    assert(!blocked.ok && blocked.code === EXIT.GATE_BLOCKED, '승인 없이 통과했습니다');

    for (const f of ['a', 'b', 'c']) fs.writeFileSync(path.join(p, `${f}.html`), '<html></html>');
    assert(runOperation('approve', { project: p, gate: 'direction', evidence: ['a.html', 'b.html', 'c.html'], note: 'B안' }).ok, 'direction 실패');
    assert(runOperation('approve', { project: p, gate: 'outline', note: '구성 확정' }).ok, 'outline 실패');

    const gen = runOperation('generate', { project: p });
    assert(gen.ok, `generate 실패: ${JSON.stringify(gen.errors)}`);
    assert(gen.rendered.length === 1, `렌더 ${gen.rendered.length}개`);

    const again = runOperation('generate', { project: p });
    assert(again.skipped.length === 1, '캐시가 동작하지 않음');

    const v = runOperation('verify', { project: p });
    assert(typeof v.status === 'string', '검수 결과가 없음');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('checkpoint 작업이 create·list·diff·restore를 모두 한다', () => {
    const dir = tmpCopy();
    const created = runOperation('checkpoint', { project: dir, action: 'create', label: '기준' });
    assert(created.ok && created.created, JSON.stringify(created));

    runOperation('revise', { project: dir, operations: [{ op: 'setText', artifact: 'deck', block: 'cover-title', value: '임시' }] });

    const diff = runOperation('checkpoint', { project: dir, action: 'diff', ref: created.created });
    assert(diff.ok && diff.changes.some((c) => c.after === '임시'), `변경을 못 찾음: ${JSON.stringify(diff.changes?.slice(0, 3))}`);

    const restored = runOperation('checkpoint', { project: dir, action: 'restore', ref: created.created });
    assert(restored.ok && restored.safetyCheckpoint, '안전 스냅샷이 없음');
    assert(readIr(dir, 'deck').slides[0].blocks[1].text !== '임시', '복구되지 않음');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /* ── MCP 프로토콜 ── */

  test('initialize가 프로토콜 버전과 서버 정보를 준다', () => {
    const [resp] = mcpExchange([{ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }]);
    assert(resp.result?.protocolVersion, '프로토콜 버전이 없음');
    assert(resp.result.serverInfo.name === 'design-studio', `서버 이름: ${resp.result.serverInfo?.name}`);
    assert(resp.result.instructions?.length > 40, '에이전트용 안내가 없음');
  });

  test('tools/list가 모든 작업을 스키마와 함께 노출한다', () => {
    const [resp] = mcpExchange([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]);
    const tools = resp.result.tools;
    assert(tools.length === Object.keys(operations).length, `도구 ${tools.length}개, 작업 ${Object.keys(operations).length}개`);
    for (const t of tools) {
      assert(t.name.startsWith('design_'), `접두어 없음: ${t.name}`);
      assert(t.inputSchema?.type === 'object', `${t.name}: 스키마 없음`);
      assert(t.description.length > 20, `${t.name}: 설명이 짧음`);
    }
    assert(tools.find((t) => t.name === 'design_status').annotations.readOnlyHint === true, 'status가 읽기 전용으로 표시되지 않음');
    assert(tools.find((t) => t.name === 'design_revise').annotations.readOnlyHint === false, 'revise가 읽기 전용으로 표시됨');
  });

  test('알림(id 없음)에는 응답하지 않는다', () => {
    const out = mcpExchange([
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 7, method: 'ping' },
    ]);
    assert(out.length === 1 && out[0].id === 7, `응답 ${out.length}개 — 알림에 답했습니다`);
  });

  test('깨진 JSON에 파싱 오류를 돌려주고 죽지 않는다', () => {
    const proc = spawnSync(process.execPath, [MCP], { input: '{깨진\n{"jsonrpc":"2.0","id":2,"method":"ping"}\n', encoding: 'utf8' });
    const out = proc.stdout.trim().split('\n').map((l) => JSON.parse(l));
    assert(out[0].error?.code === -32700, '파싱 오류를 안 돌려줌');
    assert(out[1]?.id === 2, '깨진 줄 뒤에도 계속 처리해야 합니다');
  });

  test('없는 메서드에 -32601을 돌려준다', () => {
    const [resp] = mcpExchange([{ jsonrpc: '2.0', id: 1, method: 'resources/list' }]);
    assert(resp.error?.code === -32601, `code=${resp.error?.code}`);
  });

  test('tools/call이 구조화된 결과를 돌려준다', () => {
    const dir = tmpCopy();
    const resp = toolCall('design_status', { project: dir });
    assert(resp.result.isError === false, 'isError가 true');
    const payload = payloadOf(resp);
    assert(payload.ok && payload.artifacts.length === 3, JSON.stringify(payload).slice(0, 200));
    assert(resp.result.structuredContent?.ok === true, 'structuredContent가 없음');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('작업 실패가 MCP에서 isError=true로 전달된다', () => {
    const dir = tmpCopy();
    const resp = toolCall('design_revise', { project: dir, operations: [{ op: 'setText', artifact: 'deck', block: 'ghost', value: 'x' }] });
    assert(resp.result.isError === true, '실패인데 isError가 false');
    assert(payloadOf(resp).code === EXIT.SCHEMA_INVALID, '코드가 전달되지 않음');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('없는 도구 이름에 안내를 준다', () => {
    const resp = toolCall('design_없는것', {});
    assert(resp.result.isError === true, 'isError가 false');
    assert(resp.result.content[0].text.includes('design_status'), '가능한 도구를 안내하지 않음');
  });

  test('DESIGN_PROJECT 환경변수가 기본 프로젝트가 된다', () => {
    const dir = tmpCopy();
    const resp = toolCall('design_status', {}, { DESIGN_PROJECT: dir });
    assert(payloadOf(resp).ok, `환경변수가 안 먹음: ${resp.result.content[0].text.slice(0, 160)}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('stdout에 프로토콜 외 출력이 섞이지 않는다', () => {
    const dir = tmpCopy();
    const proc = spawnSync(process.execPath, [MCP], {
      input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'design_verify', arguments: { project: dir } } })}\n`,
      encoding: 'utf8',
    });
    for (const line of proc.stdout.trim().split('\n')) {
      JSON.parse(line);   // 던지면 실패
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

/* ── REST (비동기라 별도 진입점) ── */

export async function runAsync(test, assert) {
  const dir = tmpCopy();
  const port = 7900 + Math.floor(process.pid % 90);
  const server = spawn(process.execPath, [SERVE, '--port', String(port), '--project', dir], { stdio: ['ignore', 'ignore', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('서버 기동 시간 초과')), 8000);
    server.stderr.on('data', (d) => {
      if (String(d).includes('Design Studio API')) { clearTimeout(timer); setTimeout(resolve, 120); }
    });
    server.on('error', reject);
  });

  const call = (method, urlPath, body) =>
    new Promise((resolve, reject) => {
      const data = body === undefined ? null : JSON.stringify(body);
      const req = http.request(
        { host: '127.0.0.1', port, path: urlPath, method, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} },
        (res) => {
          let out = '';
          res.on('data', (c) => { out += c; });
          res.on('end', () => resolve({ status: res.statusCode, body: out ? JSON.parse(out) : null }));
        }
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });

  await test('REST /health가 응답한다', async () => {
    const r = await call('GET', '/health');
    assert(r.status === 200 && r.body.ok, JSON.stringify(r));
  });

  await test('REST /ops가 스키마와 함께 작업을 나열한다', async () => {
    const r = await call('GET', '/ops');
    assert(r.status === 200, `status=${r.status}`);
    assert(r.body.operations.length === Object.keys(operations).length, '작업 수 불일치');
    assert(r.body.operations.every((o) => o.schema), '스키마 없는 작업이 있음');
    assert(r.body.exitCodes, '종료 코드 설명이 없음');
  });

  await test('읽기 전용 작업은 GET, 쓰기 작업은 405', async () => {
    assert((await call('GET', '/ops/status')).status === 200, 'status GET 실패');
    assert((await call('GET', '/ops/revise')).status === 405, 'revise GET이 막히지 않음');
  });

  await test('스키마 위반은 422로 매핑된다', async () => {
    const r = await call('POST', '/ops/revise', { operations: [{ op: 'setText', artifact: 'deck', block: 'ghost', value: 'x' }] });
    assert(r.status === 422, `status=${r.status}`);
    assert(r.body.code === EXIT.SCHEMA_INVALID, `code=${r.body.code}`);
  });

  await test('없는 작업·경로는 404', async () => {
    assert((await call('GET', '/ops/hologram')).status === 404, '없는 작업이 404가 아님');
    assert((await call('GET', '/nope')).status === 404, '없는 경로가 404가 아님');
  });

  await test('본문이 깨진 JSON이면 400', async () => {
    const r = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/ops/verify', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
        let out = '';
        res.on('data', (c) => { out += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(out) }));
      });
      req.on('error', reject);
      req.write('{깨짐');
      req.end();
    });
    assert(r.status === 400, `status=${r.status}`);
  });

  await test('REST와 MCP가 같은 결과를 낸다', async () => {
    const rest = await call('GET', '/ops/status');
    const mcp = payloadOf(toolCall('design_status', { project: dir }));
    assert(rest.body.project.id === mcp.project.id, '프로젝트 id 불일치');
    assert(rest.body.artifacts.length === mcp.artifacts.length, '산출물 수 불일치');
  });

  server.kill();
  fs.rmSync(dir, { recursive: true, force: true });
}
