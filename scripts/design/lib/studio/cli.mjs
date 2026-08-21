/**
 * studio/cli.mjs — design studio · checkpoint · revise
 *
 * 편집기는 파일을 직접 덮어쓰지 않는다. 패치 JSON을 내려받고 여기서 검사를 통과해야
 * 반영된다. 편집기가 오프라인 HTML이라 그런 것도 있지만, 더 중요한 이유는
 * **되돌릴 수 없는 쓰기를 UI 이벤트에 매달지 않기 위해서**다. 반영은 항상 명시적이고,
 * 반영 직전에 체크포인트가 자동으로 찍힌다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { EXIT, log, c, readJson, writeJson, nowIso } from '../util.mjs';
import { loadProject, saveProject, loadArtifactIr, validateArtifactIr, validateManifest } from '../project.mjs';
import { renderStudio } from './index.mjs';
import { createCheckpoint, listCheckpoints, findCheckpoint, restoreCheckpoint, diffCheckpoint } from '../checkpoint.mjs';
import { runQa } from '../qa.mjs';
import { auditMask } from '../reveal-mask.mjs';

const REVISIONS = path.join('.design', 'revisions.json');
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

/* ── studio ───────────────────────────────────────────────────── */

export function studioCommand(args) {
  if (args.flags.apply) return applyPatch(args);

  const ctx = loadProject(args.flags.project);
  const wanted = args.flags.artifact ? list(args.flags.artifact) : null;
  const artifacts = (ctx.manifest.artifacts || []).filter((a) => !wanted || wanted.includes(a.id));
  if (artifacts.length === 0) {
    log.error('편집할 산출물이 없습니다.');
    log.hint('design plan 으로 IR을 먼저 만드세요.');
    return EXIT.NOT_FOUND;
  }

  const irs = {};
  const missing = [];
  for (const art of artifacts) {
    const { ir } = loadArtifactIr(ctx, art);
    if (!ir) { missing.push(art.id); continue; }
    irs[art.id] = ir;
  }
  if (Object.keys(irs).length === 0) {
    log.error(`IR 파일이 없습니다: ${missing.join(', ')}`);
    return EXIT.NOT_FOUND;
  }
  for (const id of missing) log.warn(`${id}: IR이 없어 건너뜁니다.`);

  const usable = artifacts.filter((a) => irs[a.id]);
  const html = renderStudio(ctx, { artifacts: usable, irs });
  const outPath = path.resolve(ctx.dir, args.flags.out || 'out/studio.html');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');

  const rel = path.relative(ctx.dir, outPath).split(path.sep).join('/');
  log.ok(`편집기 생성 → ${rel} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
  log.hint(`산출물 ${usable.length}개: ${usable.map((a) => `${a.id}(${a.type})`).join(', ')}`);
  log.info('');
  log.info('1. 브라우저로 엽니다 (서버 불필요, 자산은 파일 안에 들어 있습니다)');
  log.info('2. 미리보기에서 요소를 클릭해 텍스트·크기·색·순서를 고칩니다');
  log.info('3. 「패치 내려받기」를 누릅니다');
  log.info(`4. ${c.bold(`design studio --apply ${ctx.manifest.id}-studio-patch.json`)}`);
  log.hint('반영 전에 체크포인트가 자동으로 찍히고, 스키마·검수를 통과해야 반영됩니다.');
  return EXIT.OK;
}

function applyPatch(args) {
  const ctx = loadProject(args.flags.project);
  const patchPath = path.resolve(ctx.dir, String(args.flags.apply));
  if (!fs.existsSync(patchPath)) {
    log.error(`패치 파일이 없습니다: ${args.flags.apply}`);
    return EXIT.NOT_FOUND;
  }

  const patch = readJson(patchPath);
  if (patch.project && patch.project !== ctx.manifest.id) {
    log.error(`패치의 프로젝트(${patch.project})가 현재 프로젝트(${ctx.manifest.id})와 다릅니다.`);
    return EXIT.USAGE;
  }

  // 반영 전 상태를 먼저 남긴다. 복구가 새로운 되돌릴 수 없는 행동이 되면 안 된다.
  const before = createCheckpoint(ctx, { label: 'studio 패치 반영 직전', auto: true });

  // 후보 상태를 메모리에서 먼저 완성한 뒤 검사한다 — 검사에 걸리면 디스크는 그대로다
  const candidateManifest = JSON.parse(JSON.stringify(ctx.manifest));
  if (patch.tokens) candidateManifest.brand.tokens = patch.tokens;

  const candidateIrs = {};
  for (const [id, ir] of Object.entries(patch.irs || {})) {
    const ref = (ctx.manifest.artifacts || []).find((a) => a.id === id);
    if (!ref) { log.warn(`${id}: 매니페스트에 없는 산출물이라 건너뜁니다.`); continue; }
    candidateIrs[id] = ir;
  }

  let errors = 0;

  const mResult = validateManifest(candidateManifest);
  for (const err of mResult.errors) { log.error(`매니페스트 ${err.path}: ${err.message}`); errors += 1; }

  for (const [id, ir] of Object.entries(candidateIrs)) {
    const r = validateArtifactIr(ir);
    for (const err of r.errors) { log.error(`${id} → ${err.path}: ${err.message}`); errors += 1; }
    // 영상은 선노출까지 본다 — 순서를 바꾸면 가장 먼저 깨지는 곳이다
    for (const scene of ir.scenes || []) {
      for (const p of auditMask(scene.layers || [], ir.canvas)) {
        log.error(`${id} → ${scene.id}.${p.layer}: ${p.message}`);
        errors += 1;
      }
    }
  }

  if (errors) {
    log.error(`오류 ${errors}건 — 반영하지 않았습니다. 원본은 그대로입니다.`);
    log.hint(`직전 상태 체크포인트: ${before.id}`);
    return EXIT.SCHEMA_INVALID;
  }

  // 검사를 통과한 뒤에만 디스크에 쓴다
  ctx.manifest.brand.tokens = candidateManifest.brand.tokens;
  let written = 0;
  for (const [id, ir] of Object.entries(candidateIrs)) {
    const ref = ctx.manifest.artifacts.find((a) => a.id === id);
    writeJson(path.resolve(ctx.dir, ref.ir), ir);
    if (ref.status === 'rendered' || ref.status === 'exported') ref.status = 'stale';
    written += 1;
    log.ok(`${id}: IR 반영 → ${ref.ir}`);
  }

  const revisions = patch.revisions || [];
  if (revisions.length) {
    const file = path.resolve(ctx.dir, REVISIONS);
    const existing = fs.existsSync(file) ? readJson(file) : { items: [] };
    existing.items = [...existing.items, ...revisions.map((r) => ({ ...r, id: `rev-${existing.items.length + 1}-${Date.now().toString(36)}` }))];
    writeJson(file, existing);
    log.ok(`수정 요청 ${revisions.length}건 접수 → ${REVISIONS}`);
    log.hint('에이전트가 design revise 로 집어갑니다.');
  }

  saveProject(ctx, { command: `studio --apply ${args.flags.apply}`, note: `${written}개 IR` });

  // 반영 후 전체 검수를 한 번 돌려 상태를 알려준다 (실패해도 반영은 유지 — 사용자 의도)
  const report = runQa(ctx);
  log.info('');
  if (report.status === 'fail') {
    log.warn(`반영했지만 전체 검수는 실패입니다 (오류 ${report.summary.errors}건). design check 로 자세히 보세요.`);
    log.hint(`되돌리려면: design checkpoint restore ${before.id}`);
  } else {
    log.ok(`전체 검수 ${report.status === 'pass' ? '통과' : `경고 ${report.summary.warnings}건`}`);
  }
  log.info(`다음 단계: ${c.bold('design render')} — 편집 결과를 산출물에 반영합니다.`);
  return EXIT.OK;
}

/* ── checkpoint ───────────────────────────────────────────────── */

export function checkpointCommand(args) {
  const ctx = loadProject(args.flags.project);
  const sub = args.positional[0] || 'list';

  if (sub === 'create') {
    const meta = createCheckpoint(ctx, { label: args.flags.label ? String(args.flags.label) : '' });
    log.ok(`체크포인트 생성: ${meta.id}${meta.label ? ` — ${meta.label}` : ''}`);
    log.hint(`${Object.keys(meta.files).length}개 파일 (매니페스트 + IR). 산출물은 다시 만들 수 있으므로 담지 않습니다.`);
    return EXIT.OK;
  }

  if (sub === 'list') {
    const all = listCheckpoints(ctx);
    if (all.length === 0) {
      log.info('체크포인트가 없습니다.');
      log.hint('design checkpoint create --label "방향 확정 직후"');
      return EXIT.OK;
    }
    console.log('');
    for (const cp of all) {
      const mark = cp.auto ? c.dim('auto') : c.green('수동');
      console.log(`  ${mark}  ${cp.id}  ${c.dim(`검수 ${cp.qa}`)}${cp.label ? `  ${cp.label}` : ''}`);
    }
    console.log('');
    log.hint('복구: design checkpoint restore <id|last>   비교: design checkpoint diff <id|last>');
    return EXIT.OK;
  }

  if (sub === 'restore') {
    const meta = findCheckpoint(ctx, args.positional[1]);
    if (!meta) { log.error(`체크포인트를 찾을 수 없습니다: ${args.positional[1] || 'last'}`); return EXIT.NOT_FOUND; }
    const { restored, safety } = restoreCheckpoint(ctx, meta);
    log.ok(`복구: ${meta.id}${meta.label ? ` — ${meta.label}` : ''}`);
    for (const rel of restored) log.hint(rel);
    log.hint(`복구 직전 상태도 남겼습니다: ${safety.id}`);
    // 복구된 매니페스트를 다시 읽어 이력을 남긴다
    const fresh = loadProject(ctx.dir);
    saveProject(fresh, { command: `checkpoint restore ${meta.id}` });
    log.info('');
    log.info(`다음 단계: ${c.bold('design render')} — 산출물을 복구된 IR로 다시 만듭니다.`);
    return EXIT.OK;
  }

  if (sub === 'diff') {
    const meta = findCheckpoint(ctx, args.positional[1]);
    if (!meta) { log.error(`체크포인트를 찾을 수 없습니다: ${args.positional[1] || 'last'}`); return EXIT.NOT_FOUND; }
    const changes = diffCheckpoint(ctx, meta);
    console.log(`\n${c.bold(meta.id)}${meta.label ? ` — ${meta.label}` : ''} ${c.dim('→ 현재')}\n`);
    if (changes.length === 0) { log.ok('차이 없음'); return EXIT.OK; }

    const byFile = new Map();
    for (const ch of changes) {
      if (!byFile.has(ch.file)) byFile.set(ch.file, []);
      byFile.get(ch.file).push(ch);
    }
    const MARK = { added: c.green('+'), removed: c.red('-'), changed: c.yellow('~'), reordered: c.blue('⇅') };
    for (const [file, items] of byFile) {
      console.log(`  ${c.bold(file)}`);
      for (const ch of items.slice(0, 60)) {
        console.log(`    ${MARK[ch.kind] || '~'} ${ch.path || '(전체)'}`);
        console.log(`        ${c.dim(ch.before)} ${c.dim('→')} ${ch.after}`);
      }
      if (items.length > 60) console.log(c.dim(`    … ${items.length - 60}건 더`));
      console.log('');
    }
    log.info(`${changes.length}건 변경`);
    return EXIT.OK;
  }

  log.error(`알 수 없는 하위 명령: ${sub}`);
  log.hint('가능: create, list, restore, diff');
  return EXIT.USAGE;
}

/* ── revise ───────────────────────────────────────────────────── */

/**
 * 편집기에서 들어온 수정 요청을 에이전트가 집어가는 창구.
 * 편집기가 LLM을 직접 부르지 않는 이유: 오프라인 HTML이고, 무엇보다 수정은
 * 에이전트가 프로젝트 전체 맥락(브랜드·출처·승인)을 보고 해야 한다.
 */
export function reviseCommand(args) {
  const ctx = loadProject(args.flags.project);
  const file = path.resolve(ctx.dir, REVISIONS);
  const store = fs.existsSync(file) ? readJson(file) : { items: [] };
  const open = store.items.filter((r) => r.status !== 'done');

  if (args.flags.done) {
    const ids = list(args.flags.done);
    let n = 0;
    for (const item of store.items) {
      if (ids.includes(item.id) || ids.includes('all')) { item.status = 'done'; item.doneAt = nowIso(); n += 1; }
    }
    writeJson(file, store);
    log.ok(`${n}건을 완료 처리했습니다.`);
    return EXIT.OK;
  }

  if (args.flags.json) {
    console.log(JSON.stringify(open, null, 2));
    return EXIT.OK;
  }

  if (open.length === 0) {
    log.info('대기 중인 수정 요청이 없습니다.');
    log.hint('design studio 에서 요소나 영역을 고르고 지시를 남기면 여기 쌓입니다.');
    return EXIT.OK;
  }

  console.log(`\n${c.bold(`수정 요청 ${open.length}건`)}\n`);
  for (const r of open) {
    const where = r.block ? `${r.artifact} / ${r.container} / ${r.block}` :
                  r.region ? `${r.artifact} / 영역 ${JSON.stringify(r.region)}` : r.artifact;
    console.log(`  ${c.blue('●')} ${c.dim(r.id)}  ${where}`);
    console.log(`     ${r.instruction}`);
    console.log('');
  }
  log.hint('처리 후: design revise --done <id>  (또는 --done all)');
  log.hint('기계용 출력: design revise --json');
  return EXIT.OK;
}
