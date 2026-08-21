#!/usr/bin/env node
/**
 * design — Design Studio 통합 CLI
 *
 * 하나의 프로젝트 매니페스트(design-project.json)에서 HTML·PPTX·MP4를 만들고,
 * 중단한 자리에서 이어가고, 검수를 통과하지 못하면 실패로 끝낸다.
 *
 * 설계 원칙
 *  1. init/plan/build/check/resume/status는 외부 의존성 없이 Node만으로 돈다.
 *  2. 무거운 포맷(pptx/pdf/mp4)은 기존 scripts/에 위임하고, 없으면 코드 5로 안내한다.
 *  3. 승인 게이트를 통과하지 않으면 render/export는 시작하지 않는다.
 *  4. 검수 오류가 있으면 종료 코드 4. CI가 이걸 보고 막는다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  EXIT, log, c, fail, nowIso, writeJson, readJson, repoRoot, sha256File,
} from './lib/util.mjs';
import {
  MANIFEST_NAME, loadProject, saveProject, validateManifest, validateArtifactIr,
  loadArtifactIr, checkGates, printGateBlock, GATE_HELP, diffInputs, commitInputCache,
  isArtifactFresh, stampOutput, gateState,
} from './lib/project.mjs';
import { runQa, writeQaArtifacts, printReport } from './lib/qa.mjs';
import { newManifest, newArtifactIr } from './lib/scaffold.mjs';
import { renderArtifactHtml } from './lib/render/html.mjs';
import { whiteboardCommand } from './lib/whiteboard/cli.mjs';
import { studioCommand, checkpointCommand, reviseCommand } from './lib/studio/cli.mjs';
import { createCheckpoint } from './lib/checkpoint.mjs';
import { getArtifactFreshness as getArtifactFreshnessFn } from './lib/project.mjs';
import { createJob, loadJob, updateJob, startJob, setJobProgress, isJobCancelled, cancelJob, retryJob, listJobs } from './lib/jobs.mjs';
import { buildSuggestions, previewSuggestion, applySuggestion } from './lib/suggestions.mjs';
import { stylesCommand } from './lib/styles/cli.mjs';

const VERSION = '1.0.0';

/* ── 인자 파싱 ─────────────────────────────────────────────────── */

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [key, inline] = arg.slice(2).split('=');
      if (inline !== undefined) flags[key] = inline;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) { flags[key] = argv[i + 1]; i += 1; }
      else flags[key] = true;
    } else positional.push(arg);
  }
  return { positional, flags };
}

const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

/* ── 명령 ─────────────────────────────────────────────────────── */

function cmdInit(args) {
  const dir = path.resolve(args.flags.dir || args.positional[0] || '.');
  const file = path.join(dir, MANIFEST_NAME);
  if (fs.existsSync(file) && !args.flags.force) {
    fail(EXIT.USAGE, `이미 프로젝트가 있습니다: ${file}`, '덮어쓰려면 --force');
  }

  const name = args.flags.name || path.basename(dir);
  const id = String(args.flags.id || name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63) || 'project';
  const deliverables = list(args.flags.deliverables) .length ? list(args.flags.deliverables) : ['html'];
  const bad = deliverables.filter((d) => !['html', 'deck', 'video', 'infographic', 'image'].includes(d));
  if (bad.length) fail(EXIT.USAGE, `알 수 없는 산출물 종류: ${bad.join(', ')}`, '가능: html, deck, video, infographic, image');

  const manifest = newManifest({
    id,
    name,
    language: args.flags.lang || 'ko',
    deliverables,
    brandName: args.flags.brand,
  });

  const result = validateManifest(manifest);
  if (!result.valid) {
    for (const err of result.errors) log.error(`${err.path}: ${err.message}`);
    fail(EXIT.SCHEMA_INVALID, '생성한 매니페스트가 스키마를 통과하지 못했습니다. (버그입니다)');
  }

  fs.mkdirSync(dir, { recursive: true });
  writeJson(file, manifest);
  log.ok(`프로젝트를 만들었습니다: ${path.relative(process.cwd(), file) || file}`);
  log.hint(`산출물: ${deliverables.join(', ')}`);
  log.info('');
  log.info(`다음 단계: ${c.bold('design plan')} — 산출물 IR 골격을 만듭니다.`);
  return EXIT.OK;
}

function cmdPlan(args) {
  const ctx = loadProject(args.flags.project);
  let created = 0;
  for (const ref of ctx.manifest.artifacts || []) {
    const irPath = path.resolve(ctx.dir, ref.ir);
    if (fs.existsSync(irPath) && !args.flags.force) {
      log.hint(`${ref.id}: IR이 이미 있습니다 (${ref.ir})`);
      continue;
    }
    const ir = newArtifactIr(ref, ctx.manifest);
    const result = validateArtifactIr(ir);
    if (!result.valid) {
      for (const err of result.errors) log.error(`${err.path}: ${err.message}`);
      fail(EXIT.SCHEMA_INVALID, `${ref.id}의 IR 골격이 스키마를 통과하지 못했습니다. (버그입니다)`);
    }
    writeJson(irPath, ir);
    log.ok(`${ref.id}: IR 생성 → ${ref.ir}`);
    created += 1;
  }
  saveProject(ctx, { command: 'plan', note: `${created}개 IR 생성` });
  log.info('');
  if (gateState(ctx.manifest, 'direction') === 'pending') {
    log.warn('삼방향 게이트가 아직 열려 있습니다.');
    log.hint(GATE_HELP.direction);
    log.hint('사용자가 고른 뒤: design approve direction --evidence a.html,b.html,c.html --note "사용자 선택 원문"');
  } else {
    log.info(`다음 단계: ${c.bold('design build')}`);
  }
  return EXIT.OK;
}

function cmdBuild(args) {
  const ctx = loadProject(args.flags.project);

  const gates = checkGates(ctx.manifest, 'build');
  if (!gates.ok && !args.flags.force) {
    printGateBlock(gates.blocked);
    saveProject(ctx, { command: 'build', result: 'blocked' });
    return EXIT.GATE_BLOCKED;
  }

  // 자산 해시·크기 채우기
  let stamped = 0;
  for (const asset of ctx.manifest.assets || []) {
    const abs = path.resolve(ctx.dir, asset.path);
    if (!fs.existsSync(abs)) {
      log.warn(`자산 파일 없음: ${asset.path}`);
      continue;
    }
    const hash = sha256File(abs);
    if (asset.sha256 !== hash) {
      asset.sha256 = hash;
      asset.bytes = fs.statSync(abs).size;
      stamped += 1;
    }
  }
  if (stamped) log.ok(`자산 ${stamped}개의 해시를 갱신했습니다.`);

  // IR 검증
  let irErrors = 0;
  for (const ref of ctx.manifest.artifacts || []) {
    const { ir } = loadArtifactIr(ctx, ref);
    if (!ir) {
      log.error(`${ref.id}: IR 파일이 없습니다 (${ref.ir}). design plan을 먼저 실행하세요.`);
      irErrors += 1;
      continue;
    }
    const result = validateArtifactIr(ir);
    if (!result.valid) {
      irErrors += result.errors.length;
      for (const err of result.errors) log.error(`${ref.id} → ${err.path}: ${err.message}`);
      continue;
    }
    if (ref.status === 'planned') ref.status = 'built';
    log.ok(`${ref.id}: IR 검증 통과 (${ir.type})`);
  }

  const diff = diffInputs(ctx);
  if (diff.changed.length || diff.added.length) {
    log.info('');
    log.step(`입력 변경: 신규 ${diff.added.length} · 변경 ${diff.changed.length} · 유지 ${diff.unchanged}`);
    for (const rel of [...diff.added, ...diff.changed]) log.hint(rel);
  } else {
    log.step(`입력 변경 없음 (${diff.unchanged}개 그대로)`);
  }
  commitInputCache(ctx, diff.current);

  saveProject(ctx, { command: 'build', result: irErrors ? 'fail' : 'ok' });
  if (irErrors) {
    log.error(`IR 오류 ${irErrors}건으로 실패했습니다.`);
    return EXIT.SCHEMA_INVALID;
  }
  log.info('');
  log.info(`다음 단계: ${c.bold('design check')} → ${c.bold('design render')}`);
  return EXIT.OK;
}

function cmdCheck(args) {
  const ctx = loadProject(args.flags.project);
  const only = list(args.flags.only);
  const strict = Boolean(args.flags.strict);

  const report = runQa(ctx, { only: only.length ? only : null, strict });
  printReport(report);

  const { htmlPath, jsonPath } = writeQaArtifacts(ctx, report);
  log.hint(`qa.json: ${path.relative(process.cwd(), jsonPath) || jsonPath}`);
  log.hint(`보고서: ${path.relative(process.cwd(), htmlPath) || htmlPath}`);
  saveProject(ctx, { command: 'check', result: report.status === 'fail' ? 'fail' : 'ok' });

  return report.status === 'fail' ? EXIT.QA_FAILED : EXIT.OK;
}


function cmdJobs(args) {
  const ctx = loadProject(args.flags.project);
  const sub = args.positional[0] || 'list';
  if (sub === 'create') { const job = createJob(ctx, { kind: args.flags.kind || 'render', artifacts: list(args.flags.artifact) }); log.ok(`작업 생성: ${job.id}`); console.log(JSON.stringify(job, null, 2)); return EXIT.OK; }
  if (sub === 'list') { console.log(JSON.stringify(listJobs(ctx), null, 2)); return EXIT.OK; }
  const job = loadJob(ctx, args.positional[1] || args.flags.id);
  if (!job) { log.error('작업을 찾을 수 없습니다.'); return EXIT.NOT_FOUND; }
  if (sub === 'status') { console.log(JSON.stringify(job, null, 2)); return EXIT.OK; }
  if (sub === 'cancel') { cancelJob(ctx, job); log.warn(`${job.id}: 취소 요청을 기록했습니다.`); return EXIT.OK; }
  if (sub === 'retry') { retryJob(ctx, job); log.ok(`${job.id}: 재시도 대기 상태로 되돌렸습니다.`); return EXIT.OK; }
  fail(EXIT.USAGE, `알 수 없는 jobs 하위 명령: ${sub}`, '가능: create, list, status, cancel, retry');
}

function cmdCache(args) {
  const ctx = loadProject(args.flags.project);
  const sub = args.positional[0] || 'status';
  const diff = diffInputs(ctx);
  if (sub === 'status') {
    console.log(JSON.stringify({ inputs: diff, stale: (ctx.manifest.artifacts || []).map((a) => ({ id: a.id, ...getArtifactFreshnessFn(ctx, a, diff.changed.length + diff.added.length + diff.removed.length > 0) })) }, null, 2));
    return EXIT.OK;
  }
  if (sub === 'clear') { ctx.manifest.cache = { inputs: {} }; saveProject(ctx, { command: 'cache clear' }); log.ok('입력 캐시를 비웠습니다. 다음 렌더에서 변경분으로 처리합니다.'); return EXIT.OK; }
  fail(EXIT.USAGE, `알 수 없는 cache 하위 명령: ${sub}`, '가능: status, clear');
}

function cmdSuggest(args) {
  const ctx = loadProject(args.flags.project);
  const reportPath = path.join(ctx.dir, 'qa.json');
  if (!fs.existsSync(reportPath)) { log.error('qa.json이 없습니다. design check를 먼저 실행하세요.'); return EXIT.NOT_FOUND; }
  const suggestions = buildSuggestions(readJson(reportPath));
  const sub = args.positional[0] || 'list';
  if (sub === 'list') { console.log(JSON.stringify(suggestions, null, 2)); return EXIT.OK; }
  const suggestion = suggestions.find((x) => x.id === (args.positional[1] || args.flags.id));
  if (sub === 'preview') { if (!suggestion) return fail(EXIT.NOT_FOUND, '제안 ID를 찾을 수 없습니다.'); console.log(JSON.stringify(previewSuggestion(suggestion, { sourceFile: args.flags.source, jsonPath: args.flags.path, value: args.flags.value }), null, 2)); return EXIT.OK; }
  if (sub === 'apply') {
    if (!suggestion) return fail(EXIT.NOT_FOUND, '제안 ID를 찾을 수 없습니다.');
    let value = args.flags.value;
    if (typeof value === 'string') { try { value = JSON.parse(value); } catch { /* 문자열 값으로 적용 */ } }
    try {
      const result = applySuggestion(ctx, suggestion, { sourceFile: args.flags.source, jsonPath: args.flags.path, value, approved: Boolean(args.flags.approve) });
      console.log(JSON.stringify(result, null, 2));
      return EXIT.OK;
    } catch (error) { return fail(EXIT.USAGE, error.message); }
  }
  fail(EXIT.USAGE, `알 수 없는 suggest 하위 명령: ${sub}`, '가능: list, preview <id>, apply <id> --source 파일.json --path /경로 --value 값 --approve');
}

function cmdRender(args) {
  const ctx = loadProject(args.flags.project);

  const gates = checkGates(ctx.manifest, 'render');
  if (!gates.ok && !args.flags.force) {
    printGateBlock(gates.blocked);
    saveProject(ctx, { command: 'render', result: 'blocked' });
    return EXIT.GATE_BLOCKED;
  }

  const wanted = args.flags.artifact ? list(args.flags.artifact) : null;
  const diff = diffInputs(ctx);
  const inputsDirty = diff.changed.length > 0 || diff.added.length > 0 || diff.removed.length > 0;
  const outRoot = path.resolve(ctx.dir, args.flags.out || 'out');
  const job = args.flags.job ? loadJob(ctx, args.flags.job) : createJob(ctx, { kind: 'render', artifacts: (ctx.manifest.artifacts || []).filter((a) => !wanted || wanted.includes(a.id)).map((a) => a.id) });
  if (!job) return fail(EXIT.NOT_FOUND, `작업을 찾을 수 없습니다: ${args.flags.job}`);
  if (job.state === 'completed') return fail(EXIT.USAGE, `이미 완료된 작업입니다: ${job.id}. 새 렌더 작업을 시작하세요.`);
  startJob(ctx, job);

  let rendered = 0;
  let skipped = 0;
  const jobTargets = (ctx.manifest.artifacts || []).filter((ref) => !wanted || wanted.includes(ref.id));
  let jobDone = 0;
  for (const ref of jobTargets) {
    if (isJobCancelled(ctx, job)) { updateJob(ctx, job, { state: 'cancelled' }); log.warn(`${job.id}: 취소되어 렌더를 중단합니다.`); return EXIT.OK; }
    if (wanted && !wanted.includes(ref.id)) continue;
    setJobProgress(ctx, job, jobDone, jobTargets.length);
    const item = (job.artifacts || []).find((x) => x.artifact === ref.id);
    if (item && (item.state === 'done' || item.state === 'skipped') && !args.flags.force) {
      jobDone += 1;
      setJobProgress(ctx, job, jobDone, jobTargets.length);
      log.hint(`${ref.id}: 작업 기록상 완료되어 재사용합니다.`);
      continue;
    }
    if (item) { item.state = 'running'; updateJob(ctx, job); }
    const { ir } = loadArtifactIr(ctx, ref);
    if (!ir) {
      if (item) item.state = 'failed';
      updateJob(ctx, job, { state: 'failed', failedArtifact: ref.id, error: 'IR 파일이 없습니다.' });
      log.error(`${ref.id}: IR이 없습니다. design plan을 먼저 실행하세요.`);
      return EXIT.NOT_FOUND;
    }

    if (!args.flags.force && isArtifactFresh(ctx, ref, inputsDirty)) {
      log.hint(`${ref.id}: 변경 없음 — 건너뜁니다.`);
      skipped += 1;
      if (item) item.state = 'skipped';
      jobDone += 1; setJobProgress(ctx, job, jobDone, jobTargets.length);
      continue;
    }

    let outputs;
    try {
      outputs = renderArtifactHtml(ctx, ref, ir, path.join(outRoot, ref.id));
    } catch (error) {
      if (item) item.state = 'failed';
      updateJob(ctx, job, { state: 'failed', failedArtifact: ref.id, error: error.message });
      log.error(`${ref.id}: 렌더 실패 — ${error.message}`);
      return EXIT.USAGE;
    }
    const stampedOutputs = outputs.map((out) => stampOutput(ctx, out));
    // HTML 산출물은 교체, 다른 포맷(pptx/pdf/mp4)은 export가 관리하므로 보존
    ref.outputs = [...(ref.outputs || []).filter((o) => o.format !== 'html'), ...stampedOutputs];
    ref.status = 'rendered';
    rendered += 1;
    if (item) item.state = 'done';
    jobDone += 1; setJobProgress(ctx, job, jobDone, jobTargets.length);
    for (const out of stampedOutputs) log.ok(`${ref.id}: ${out.path} (${out.bytes.toLocaleString('ko-KR')} bytes)`);
  }

  commitInputCache(ctx, diff.current);
  updateJob(ctx, job, { state: 'completed', finishedAt: nowIso(), progress: { done: jobTargets.length, total: jobTargets.length, percent: 100 } });
  saveProject(ctx, { command: 'render', note: `렌더 ${rendered} · 건너뜀 ${skipped} · 작업 ${job.id}` });
  log.info('');
  log.info(`렌더 ${rendered}개 · 캐시로 건너뜀 ${skipped}개`);
  log.info(`다음 단계: ${c.bold('design check')} → ${c.bold('design export --format pptx|pdf|mp4')}`);
  return EXIT.OK;
}

/** 무거운 포맷은 저장소의 기존 스크립트에 위임한다. */
const EXPORTERS = {
  pptx: { script: 'scripts/export_deck_pptx.mjs', runner: 'node', needs: ['pptxgenjs', 'playwright'], types: ['deck'] },
  pdf: { script: 'scripts/export_deck_pdf.mjs', runner: 'node', needs: ['playwright'], types: ['deck', 'html', 'infographic'] },
  mp4: { script: 'scripts/render-video-seek.js', runner: 'node', needs: ['playwright'], types: ['video'] },
};

function cmdExport(args) {
  const ctx = loadProject(args.flags.project);

  const gates = checkGates(ctx.manifest, 'export');
  if (!gates.ok && !args.flags.force) {
    printGateBlock(gates.blocked);
    saveProject(ctx, { command: 'export', result: 'blocked' });
    return EXIT.GATE_BLOCKED;
  }

  const format = args.flags.format;
  if (!format || !EXPORTERS[format]) {
    fail(EXIT.USAGE, `--format 이 필요합니다. 가능: ${Object.keys(EXPORTERS).join(', ')}`);
  }
  const exporter = EXPORTERS[format];
  const wanted = args.flags.artifact ? list(args.flags.artifact) : null;
  const targets = (ctx.manifest.artifacts || []).filter(
    (ref) => exporter.types.includes(ref.type) && (!wanted || wanted.includes(ref.id))
  );
  if (targets.length === 0) {
    fail(EXIT.USAGE, `${format}로 내보낼 산출물이 없습니다.`, `${format}는 ${exporter.types.join('/')} 타입만 지원합니다.`);
  }

  const scriptPath = path.join(repoRoot(), exporter.script);
  if (!fs.existsSync(scriptPath)) {
    fail(EXIT.MISSING_DEPENDENCY, `내보내기 스크립트를 찾을 수 없습니다: ${exporter.script}`);
  }

  for (const ref of targets) {
    const html = (ref.outputs || []).find((o) => o.format === 'html');
    if (!html) {
      log.error(`${ref.id}: 먼저 design render로 HTML을 만들어야 합니다.`);
      return EXIT.NOT_FOUND;
    }
    const htmlAbs = path.resolve(ctx.dir, html.path);
    const outAbs = path.resolve(ctx.dir, args.flags.out || 'out', ref.id, `${ref.id}.${format}`);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });

    log.step(`${ref.id} → ${format}: ${exporter.script}`);
    const proc = spawnSync(exporter.runner, [scriptPath, htmlAbs, outAbs], { stdio: 'inherit', cwd: repoRoot() });

    if (proc.error || proc.status !== 0) {
      log.error(`${ref.id}: ${format} 내보내기 실패`);
      log.hint(`필요한 패키지: ${exporter.needs.join(', ')}`);
      log.hint(`설치: npm install ${exporter.needs.join(' ')}${exporter.needs.includes('playwright') ? ' && npx playwright install chromium' : ''}`);
      saveProject(ctx, { command: `export --format ${format}`, result: 'fail' });
      return EXIT.MISSING_DEPENDENCY;
    }

    if (fs.existsSync(outAbs)) {
      const rel = path.relative(ctx.dir, outAbs).split(path.sep).join('/');
      ref.outputs = [
        ...(ref.outputs || []).filter((o) => o.format !== format),
        stampOutput(ctx, { path: rel, format, mode: format === 'pptx' ? 'native' : undefined }),
      ];
      ref.status = 'exported';
      log.ok(`${ref.id}: ${rel}`);
    }
  }

  saveProject(ctx, { command: `export --format ${format}` });
  log.info('');
  log.info(`다음 단계: ${c.bold('design check')} — 내보낸 파일의 구조까지 검사합니다.`);
  return EXIT.OK;
}

function cmdResume(args) {
  const ctx = loadProject(args.flags.project);
  const m = ctx.manifest;

  console.log(`\n${c.bold(m.name)} ${c.dim(`(${m.id})`)}`);
  console.log(c.dim(`${m.brief?.purpose || ''}`));

  console.log(`\n${c.bold('승인 게이트')}`);
  const gateOrder = ['facts', 'assets', 'direction', 'outline', 'draft', 'final'];
  let nextGate = null;
  for (const gate of gateOrder) {
    const g = m.approvals?.[gate];
    if (!g) continue;
    const mark = g.state === 'approved' ? c.green('✔') : g.state === 'waived' ? c.yellow('~') : g.state === 'rejected' ? c.red('✖') : c.dim('·');
    console.log(`  ${mark} ${gate.padEnd(10)} ${g.state}${g.note ? c.dim(` — ${g.note}`) : ''}`);
    if (!nextGate && g.state === 'pending') nextGate = gate;
  }

  console.log(`\n${c.bold('산출물')}`);
  for (const ref of m.artifacts || []) {
    const outs = (ref.outputs || []).map((o) => o.format).join(', ') || '없음';
    console.log(`  ${ref.id.padEnd(16)} ${ref.type.padEnd(12)} ${ref.status.padEnd(10)} ${c.dim(outs)}`);
  }

  const diff = diffInputs(ctx);
  const dirty = diff.changed.length + diff.added.length + diff.removed.length;
  console.log(`\n${c.bold('입력 캐시')}`);
  console.log(`  ${dirty === 0 ? c.green('최신') : c.yellow(`${dirty}개 변경`)} · 유지 ${diff.unchanged}개`);
  if (dirty) for (const rel of [...diff.added, ...diff.changed]) console.log(c.dim(`  ~ ${rel}`));

  console.log(`\n${c.bold('검수')}`);
  const qa = m.qa || {};
  console.log(`  ${qa.status || 'never'}${qa.lastRun ? c.dim(` · ${qa.lastRun}`) : ''}${
    qa.errors !== undefined ? c.dim(` · 오류 ${qa.errors} · 경고 ${qa.warnings}`) : ''
  }`);

  const last = (m.history || []).slice(-1)[0];
  if (last) console.log(`\n${c.bold('마지막 실행')}\n  ${last.command} → ${last.result || 'ok'} ${c.dim(last.at)}`);

  console.log(`\n${c.bold('다음 할 일')}`);
  const suggestions = [];
  if (nextGate) suggestions.push(`design approve ${nextGate}   ${c.dim(`— ${GATE_HELP[nextGate] || ''}`)}`);
  if ((m.artifacts || []).some((a) => !fs.existsSync(path.resolve(ctx.dir, a.ir)))) suggestions.push('design plan');
  else if (dirty) suggestions.push('design build');
  if ((m.artifacts || []).some((a) => a.status === 'built' || a.status === 'planned')) suggestions.push('design render');
  if (qa.status !== 'pass') suggestions.push('design check');
  if (suggestions.length === 0) suggestions.push('design export --format pptx|pdf|mp4');
  for (const s of suggestions) console.log(`  ${s}`);
  console.log('');
  return EXIT.OK;
}

function cmdApprove(args) {
  const ctx = loadProject(args.flags.project);
  const gate = args.positional[0];
  const valid = ['facts', 'assets', 'direction', 'outline', 'draft', 'final'];
  if (!gate || !valid.includes(gate)) {
    fail(EXIT.USAGE, `게이트 이름이 필요합니다. 가능: ${valid.join(', ')}`);
  }

  const state = args.flags.reject ? 'rejected' : args.flags.waive ? 'waived' : 'approved';
  const evidence = list(args.flags.evidence);

  if (state === 'approved' && gate === 'direction' && evidence.length < 3 && !args.flags.force) {
    fail(
      EXIT.GATE_BLOCKED,
      '삼방향 게이트는 초안 3개의 증거가 필요합니다.',
      '예: design approve direction --evidence a.html,b.html,c.html --note "사용자: B안으로 갑시다"'
    );
  }
  if (state === 'waived' && !args.flags.note) {
    fail(EXIT.USAGE, '면제(--waive)는 사용자 원문을 --note로 남겨야 합니다.', '감사 로그가 없는 면제는 허용하지 않습니다.');
  }

  for (const rel of evidence) {
    if (!fs.existsSync(path.resolve(ctx.dir, rel))) log.warn(`증거 파일이 없습니다: ${rel}`);
  }

  ctx.manifest.approvals = ctx.manifest.approvals || {};
  ctx.manifest.approvals[gate] = {
    state,
    at: nowIso(),
    ...(args.flags.by ? { by: String(args.flags.by) } : {}),
    ...(args.flags.note ? { note: String(args.flags.note) } : {}),
    ...(evidence.length ? { evidence } : {}),
  };

  saveProject(ctx, { command: `approve ${gate} (${state})` });
  const mark = state === 'approved' ? log.ok : state === 'rejected' ? log.error : log.warn;
  mark(`${gate} 게이트: ${state}`);

  // 승인은 자연스러운 되돌리기 지점이다. 여기서 찍어두면 "방향 확정 시점으로"가 가능해진다.
  if (state === 'approved' || state === 'waived') {
    const cp = createCheckpoint(ctx, { label: `${gate} ${state}`, auto: true });
    log.hint(`체크포인트: ${cp.id}`);
  }
  return EXIT.OK;
}

function cmdValidate(args) {
  const target = args.positional[0];
  if (target) {
    const data = readJson(path.resolve(target));
    const isManifest = data.schemaVersion && data.brief;
    const result = isManifest ? validateManifest(data) : validateArtifactIr(data);
    if (result.valid) {
      log.ok(`${target}: ${isManifest ? '매니페스트' : 'IR'} 스키마 통과`);
      return EXIT.OK;
    }
    for (const err of result.errors) log.error(`${err.path || '(root)'}: ${err.message}`);
    return EXIT.SCHEMA_INVALID;
  }

  const ctx = loadProject(args.flags.project);
  let bad = 0;
  const mResult = validateManifest(ctx.manifest);
  if (mResult.valid) log.ok('매니페스트 스키마 통과');
  else { bad += 1; for (const err of mResult.errors) log.error(`${MANIFEST_NAME} → ${err.path || '(root)'}: ${err.message}`); }

  for (const ref of ctx.manifest.artifacts || []) {
    const { ir } = loadArtifactIr(ctx, ref);
    if (!ir) { log.error(`${ref.id}: IR 없음 (${ref.ir})`); bad += 1; continue; }
    const r = validateArtifactIr(ir);
    if (r.valid) log.ok(`${ref.id}: IR 스키마 통과`);
    else { bad += 1; for (const err of r.errors) log.error(`${ref.ir} → ${err.path || '(root)'}: ${err.message}`); }
  }
  return bad ? EXIT.SCHEMA_INVALID : EXIT.OK;
}

function cmdHelp() {
  console.log(`
${c.bold('design')} ${c.dim(`v${VERSION}`)} — Design Studio 통합 CLI

${c.bold('명령')}
  init      새 프로젝트 매니페스트를 만든다
              --name <이름> --id <슬러그> --deliverables html,deck,video --lang ko
  plan      선언한 산출물의 IR 골격을 만든다            --force로 덮어쓰기
  build     자산 해시를 갱신하고 IR을 검증하고 캐시를 갱신한다
  check     자동 품질 게이트를 돌리고 qa.json·qa-report.html을 쓴다
              --strict 경고도 실패로 --only structure,provenance,design,media
  render    IR을 HTML로 렌더링한다 (변경 없는 산출물은 건너뜀)
              --artifact <id> --out <dir> --force --job <id>
  export    HTML을 pptx/pdf/mp4로 내보낸다 (기존 scripts/에 위임)
              --format pptx|pdf|mp4 --artifact <id>
  resume    지금 상태와 다음에 할 일을 보여준다
  approve   승인 게이트를 기록한다
              <게이트> --note "사용자 원문" --evidence a.html,b.html,c.html
              --waive 면제  --reject 반려
  validate  스키마만 검증한다 (파일 경로를 주면 그 파일만)

${c.bold('편집 · 되돌리기')}
  studio      브라우저 편집기를 만든다 (요소 선택 · 토큰 · 순서 · 타임라인)
                --artifact <id> --out <경로>
                --apply <패치.json> 으로 편집 결과를 반영 (검사 통과해야 반영)
  jobs       작업 상태       create | list | status | cancel | retry
  cache      입력 캐시·stale  status | clear
  suggest    검수 수정 제안   list | preview <id>
  checkpoint  작업 스냅샷        create --label "..." | list | restore <id|last> | diff <id|last>
  revise      편집기에서 들어온 수정 요청 목록   --json | --done <id|all>

${c.bold('스타일')}
  styles      스타일 레지스트리 60종     list | show <id> | suggest | apply <id> | rebuild
                삼방향 후보는 온도가 겹치지 않게 보장한다

${c.bold('에이전트 · 서버')}
  mcp         MCP stdio 서버          node scripts/design/mcp.mjs --tools 로 도구 목록
  serve       로컬 REST API           node scripts/design/serve.mjs --port 7801
                두 표면 모두 같은 작업 정의를 쓴다 (lib/api/operations.mjs)

${c.bold('선택형 플러그인')}
  whiteboard  SRT 기반 화이트보드 영상 — plan/annotate/preview/render/verify
                자세히: design whiteboard help

${c.bold('승인 게이트')}  facts → assets → direction → outline → draft → final
  build는 direction, render는 +outline, export는 +draft가 필요하다.

${c.bold('종료 코드')}
  0 성공 · 1 사용법 오류 · 2 스키마 위반 · 3 게이트 미승인 · 4 검수 실패
  5 의존성 없음 · 6 대상 없음

${c.bold('예')}
  design init --name "제품 소개" --deliverables deck,video
  design plan && design build
  design approve direction --evidence a.html,b.html,c.html --note "사용자: B안"
  design render && design check --strict
`);
  return EXIT.OK;
}

/* ── 진입점 ───────────────────────────────────────────────────── */

const COMMANDS = {
  init: cmdInit, plan: cmdPlan, build: cmdBuild, check: cmdCheck,
  render: cmdRender, export: cmdExport, resume: cmdResume, status: cmdResume,
  approve: cmdApprove, validate: cmdValidate, help: cmdHelp,
  studio: studioCommand, checkpoint: checkpointCommand, revise: reviseCommand,
  jobs: cmdJobs, cache: cmdCache, suggest: cmdSuggest,
  styles: stylesCommand,
  whiteboard: whiteboardCommand,
};

function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === '--help' || cmd === '-h') return cmdHelp();
  if (cmd === '--version' || cmd === '-v') { console.log(VERSION); return EXIT.OK; }

  const handler = COMMANDS[cmd];
  if (!handler) {
    log.error(`알 수 없는 명령: ${cmd}`);
    log.hint(`가능: ${Object.keys(COMMANDS).join(', ')}`);
    return EXIT.USAGE;
  }

  try {
    return handler(parseArgs(rest));
  } catch (err) {
    log.error(err.message);
    if (process.env.DESIGN_DEBUG) console.error(err.stack);
    return err.exitCode || EXIT.USAGE;
  }
}

process.exit(main());
