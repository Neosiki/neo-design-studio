/**
 * api/operations.mjs — MCP·REST가 공유하는 단일 작업 표면
 *
 * 로드맵 5.5는 `generate`, `inspect`, `revise`, `verify`, `export` 다섯 도구를 말한다.
 * 여기에 프로젝트를 시작하고(`init`, `plan`), 상태를 보고(`status`), 합의를 기록하고
 * (`approve`), 되돌리는(`checkpoint`) 작업을 더해 에이전트가 CLI 없이도 전 과정을
 * 돌릴 수 있게 한다.
 *
 * 설계 규칙
 *  1. CLI를 셸로 부르지 않는다. 같은 lib 함수를 직접 호출한다 — 프로세스 왕복도,
 *     stdout 파싱도 없다.
 *  2. 반환은 사람이 읽는 문장이 아니라 **구조화된 데이터**다. 에이전트가 파싱할
 *     대상이 문장이면 그건 계약이 아니다.
 *  3. 실패는 예외가 아니라 `{ ok: false, code, errors }`로 돌아온다. code는 CLI의
 *     종료 코드와 같은 의미를 쓴다 — 세 표면이 같은 어휘를 갖는다.
 *
 * 모델 공급자 계층에 대하여: Design Studio의 CLI는 모델을 부르지 않는다. 생각은
 * 에이전트가 하고 여기서는 결정론적인 일만 한다. 그래서 별도의 OpenAI/Gemini 어댑터를
 * 만들지 않았다 — **MCP 자체가 공급자 중립 계층**이고, MCP를 말하는 어떤 모델이든
 * 이 표면을 그대로 쓴다. 없는 추상화를 만드는 것보다 이쪽이 정직하다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXIT, nowIso, repoRoot, sha256File, writeJson, readJson } from '../util.mjs';
import {
  MANIFEST_NAME, loadProject, saveProject, validateManifest, validateArtifactIr,
  loadArtifactIr, checkGates, GATE_HELP, diffInputs, commitInputCache, isArtifactFresh,
  stampOutput, gateState,
} from '../project.mjs';
import { newManifest, newArtifactIr } from '../scaffold.mjs';
import { renderArtifactHtml } from '../render/html.mjs';
import { runQa, writeQaArtifacts } from '../qa.mjs';
import { createCheckpoint, listCheckpoints, findCheckpoint, restoreCheckpoint, diffCheckpoint } from '../checkpoint.mjs';
import { applyOperations, OPERATIONS } from './revise.mjs';
import { createJob, loadJob, cancelJob, retryJob, listJobs } from '../jobs.mjs';
import { getArtifactFreshness } from '../project.mjs';
import { buildSuggestions, previewSuggestion, applySuggestion } from '../suggestions.mjs';
import { planWhiteboardIr } from '../whiteboard/plan.mjs';
import { loadRegistry, searchStyles, getStyle, findSimilar, suggestDirections, buildStyleEntry, isStale } from '../styles/registry.mjs';

const REVISIONS = path.join('.design', 'revisions.json');

const ok = (data) => ({ ok: true, code: EXIT.OK, ...data });
const err = (code, message, extra = {}) => ({ ok: false, code, errors: [{ message }], ...extra });
const errs = (code, list, extra = {}) => ({ ok: false, code, errors: list, ...extra });

/** 프로젝트를 연다. 없으면 구조화된 실패를 돌려준다(예외 대신). */
function open(input) {
  try {
    return { ctx: loadProject(input.project) };
  } catch (e) {
    return { fail: err(e.exitCode || EXIT.NOT_FOUND, e.message) };
  }
}

/* ── 작업 정의 ────────────────────────────────────────────────── */

export const operations = {
  /* 상태 읽기 — 에이전트가 가장 먼저 부르는 것 */
  status: {
    title: '프로젝트 상태',
    description:
      '매니페스트 요약, 승인 게이트, 산출물 상태, 입력 캐시, 최근 검수 결과, 그리고 다음에 할 일 제안. ' +
      '작업을 이어받을 때 가장 먼저 부른다.',
    schema: { type: 'object', properties: { project: { type: 'string', description: '프로젝트 디렉터리 (생략하면 현재 위치에서 위로 찾는다)' } } },
    readOnly: true,
    run(input) {
      const { ctx, fail } = open(input);
      if (fail) return fail;
      const m = ctx.manifest;
      const diff = diffInputs(ctx);
      const gates = {};
      let nextGate = null;
      for (const [name, g] of Object.entries(m.approvals || {})) {
        gates[name] = { state: g.state, note: g.note || null, at: g.at || null };
        if (!nextGate && g.state === 'pending') nextGate = name;
      }
      const revisions = readRevisions(ctx).filter((r) => r.status !== 'done');

      const next = [];
      if (nextGate) next.push({ op: 'approve', why: GATE_HELP[nextGate] || '', gate: nextGate });
      if ((m.artifacts || []).some((a) => !fs.existsSync(path.resolve(ctx.dir, a.ir)))) next.push({ op: 'plan', why: 'IR이 없는 산출물이 있다' });
      else if (diff.changed.length + diff.added.length > 0) next.push({ op: 'generate', why: '입력이 바뀌었다' });
      if (m.qa?.status !== 'pass') next.push({ op: 'verify', why: '검수를 아직 통과하지 못했다' });
      if (revisions.length) next.push({ op: 'revise', why: `대기 중인 수정 요청 ${revisions.length}건` });

      return ok({
        project: { id: m.id, name: m.name, dir: ctx.dir, language: m.brief?.language, purpose: m.brief?.purpose },
        brand: { name: m.brand?.name, assetProtocol: m.brand?.assetProtocol, tokens: m.brand?.tokens },
        style: m.style ? { id: m.style.id, name: m.style.name, rationale: m.style.rationale } : null,
        approvals: gates,
        artifacts: (m.artifacts || []).map((a) => ({
          id: a.id, type: a.type, title: a.title, status: a.status,
          outputs: (a.outputs || []).map((o) => ({ path: o.path, format: o.format })),
          fresh: isArtifactFresh(ctx, a, diff.changed.length + diff.added.length > 0),
        })),
        inputs: { changed: diff.changed, added: diff.added, removed: diff.removed, unchanged: diff.unchanged },
        qa: m.qa || { status: 'never' },
        pendingRevisions: revisions.length,
        lastCommand: (m.history || []).slice(-1)[0] || null,
        suggestedNext: next,
      });
    },
  },

  jobs: {
    title: '작업 상태·취소·재시도',
    description: '렌더 작업의 진행률과 장면별 상태를 조회하고 취소·재시도를 요청한다.',
    schema: { type: 'object', required: ['action'], properties: { project: { type: 'string' }, action: { enum: ['create', 'list', 'status', 'cancel', 'retry'] }, id: { type: 'string' }, kind: { type: 'string' }, artifacts: { type: 'array', items: { type: 'string' } } } },
    readOnly: false,
    run(input) {
      const { ctx, fail } = open(input); if (fail) return fail; const action = input.action || 'list';
      if (action === 'create') return ok({ job: createJob(ctx, { kind: input.kind || 'render', artifacts: input.artifacts || [] }) });
      if (action === 'list') return ok({ jobs: listJobs(ctx) });
      const job = loadJob(ctx, input.id); if (!job) return err(EXIT.NOT_FOUND, `작업을 찾을 수 없습니다: ${input.id}`);
      if (action === 'status') return ok({ job });
      if (action === 'cancel') return ok({ job: cancelJob(ctx, job) });
      if (action === 'retry') return ok({ job: retryJob(ctx, job) });
      return err(EXIT.USAGE, `알 수 없는 작업 동작: ${action}`);
    },
  },

  cache: {
    title: '입력 캐시·stale 상태',
    description: '입력 변경 내역과 산출물별 최신·stale 사유를 조회하고 입력 캐시를 초기화한다.',
    schema: { type: 'object', properties: { project: { type: 'string' }, action: { enum: ['status', 'clear'] } } },
    readOnly: false,
    run(input) { const { ctx, fail } = open(input); if (fail) return fail; const diff = diffInputs(ctx); if (input.action === 'clear') { ctx.manifest.cache = { inputs: {} }; saveProject(ctx, { command: 'api cache clear' }); return ok({ cleared: true }); } return ok({ inputs: diff, artifacts: (ctx.manifest.artifacts || []).map((a) => ({ id: a.id, ...getArtifactFreshness(ctx, a, diff.changed.length + diff.added.length + diff.removed.length > 0) })) }); },
  },

  suggestions: {
    title: '검수 자동 수정 제안·미리보기',
    description: 'qa.json의 오류·경고를 안전한 수정 제안으로 변환하고 적용 전 미리보기를 제공한다.',
schema: { type: 'object', required: ['action'], properties: { project: { type: 'string' }, action: { enum: ['list', 'preview', 'apply'] }, id: { type: 'string' }, sourceFile: { type: 'string' }, jsonPath: { type: 'string' }, value: {}, approved: { type: 'boolean' } } },
    readOnly: false,
    run(input) {
      const { ctx, fail } = open(input); if (fail) return fail;
      const qaPath = path.join(ctx.dir, 'qa.json');
      if (!fs.existsSync(qaPath)) return err(EXIT.NOT_FOUND, 'qa.json이 없습니다. verify를 먼저 실행하세요.');
      const all = buildSuggestions(readJson(qaPath));
      if (input.action === 'list') return ok({ suggestions: all });
      const suggestion = all.find((s) => s.id === input.id);
      if (!suggestion) return err(EXIT.NOT_FOUND, `제안 ID를 찾을 수 없습니다: ${input.id}`);
      if (input.action === 'preview') return ok({ preview: previewSuggestion(suggestion, input) });
      if (input.action === 'apply') {
        try { return ok({ result: applySuggestion(ctx, suggestion, { sourceFile: input.sourceFile, jsonPath: input.jsonPath, value: input.value, approved: input.approved === true }) }); }
        catch (e) { return err(EXIT.USAGE, e.message); }
      }
      return err(EXIT.USAGE, `알 수 없는 제안 동작: ${input.action}`);
    },
  },

  /* 구조 읽기 — 무엇을 고칠 수 있는지 알려준다 */
  inspect: {
    title: '산출물 구조 조회',
    description:
      '산출물의 IR 구조를 컨테이너(슬라이드·장면·섹션)와 블록 단위로 돌려준다. ' +
      'revise 연산에 쓸 정확한 id를 여기서 얻는다. detail=full이면 IR 원본 전체를 준다.',
    schema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        artifact: { type: 'string', description: '산출물 id (생략하면 전부)' },
        detail: { enum: ['summary', 'full'], default: 'summary' },
      },
    },
    readOnly: true,
    run(input) {
      const { ctx, fail } = open(input);
      if (fail) return fail;
      const refs = (ctx.manifest.artifacts || []).filter((a) => !input.artifact || a.id === input.artifact);
      if (refs.length === 0) return err(EXIT.NOT_FOUND, `산출물을 찾을 수 없습니다: ${input.artifact}`);

      const out = refs.map((ref) => {
        const { ir } = loadArtifactIr(ctx, ref);
        if (!ir) return { id: ref.id, type: ref.type, error: 'IR 파일 없음' };
        if (input.detail === 'full') return { id: ref.id, type: ref.type, ir };

        const containers = [];
        for (const page of ir.pages || []) {
          for (const s of page.sections || []) containers.push(summarize(s.id, s.kind || 'section', s.blocks));
        }
        for (const s of ir.slides || []) containers.push(summarize(s.id, s.layout, s.blocks, { title: s.title, notes: !!s.notes }));
        for (const s of ir.scenes || []) {
          containers.push(summarize(s.id, s.narrativeRole || 'scene', (s.layers || []).map((l) => l.block).filter(Boolean), {
            startMs: s.startMs, durationMs: s.durationMs, subtitle: s.subtitle,
            layers: (s.layers || []).map((l) => ({ id: l.id, enterMs: l.enterMs, exitMs: l.exitMs, plugin: l.render?.plugin || null })),
          }));
        }
        return {
          id: ref.id, type: ref.type, title: ref.title, status: ref.status,
          canvas: ir.canvas || null,
          totalMs: ir.scenes ? ir.scenes.reduce((m, s) => Math.max(m, s.startMs + s.durationMs), 0) : undefined,
          containers,
        };
      });

      return ok({
        artifacts: out,
        tokens: ctx.manifest.brand?.tokens,
        sources: (ctx.manifest.sources || []).map((s) => ({ id: s.id, title: s.title })),
        assets: (ctx.manifest.assets || []).map((a) => ({ id: a.id, kind: a.kind, alt: a.alt || null })),
      });
    },
  },

  /* 프로젝트 시작 */
  init: {
    title: '프로젝트 생성',
    description: '새 프로젝트 매니페스트를 만든다. deliverables에 적은 산출물마다 항목이 준비된다.',
    schema: {
      type: 'object',
      required: ['dir', 'name'],
      properties: {
        dir: { type: 'string', description: '만들 디렉터리' },
        name: { type: 'string' },
        id: { type: 'string', description: '슬러그 (생략하면 name에서 만든다)' },
        language: { type: 'string', default: 'ko' },
        deliverables: { type: 'array', items: { enum: ['html', 'deck', 'video', 'infographic', 'image'] } },
        brand: { type: 'string' },
        force: { type: 'boolean' },
      },
    },
    run(input) {
      const dir = path.resolve(input.dir);
      const file = path.join(dir, MANIFEST_NAME);
      if (fs.existsSync(file) && !input.force) return err(EXIT.USAGE, `이미 프로젝트가 있습니다: ${file} (force로 덮어쓰기)`);

      const id = String(input.id || input.name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63) || 'project';
      const manifest = newManifest({
        id, name: input.name, language: input.language || 'ko',
        deliverables: input.deliverables?.length ? input.deliverables : ['html'],
        brandName: input.brand,
      });
      const result = validateManifest(manifest);
      if (!result.valid) return errs(EXIT.SCHEMA_INVALID, result.errors.map((e) => ({ where: e.path, message: e.message })));

      fs.mkdirSync(dir, { recursive: true });
      writeJson(file, manifest);
      return ok({ dir, id, manifestPath: file, artifacts: manifest.artifacts.map((a) => a.id), nextOp: 'plan' });
    },
  },

  plan: {
    title: 'IR 골격 생성',
    description:
      '선언한 산출물마다 IR 골격을 만든다. srt를 주면 화이트보드 영상 계획(자막→장면 경계)까지 세운다.',
    schema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        force: { type: 'boolean', description: '이미 있는 IR도 덮어쓴다' },
        srt: { type: 'string', description: 'SRT 경로 — 주면 화이트보드 영상 계획을 세운다' },
        artifact: { type: 'string', description: 'srt와 함께 쓸 산출물 id' },
        mode: { enum: ['skeleton', 'grid'] },
        targetSec: { type: 'number', description: '장면 목표 길이(초)' },
      },
    },
    run(input) {
      const { ctx, fail } = open(input);
      if (fail) return fail;

      if (input.srt) {
        const abs = path.resolve(ctx.dir, input.srt);
        if (!fs.existsSync(abs)) return err(EXIT.NOT_FOUND, `SRT 파일이 없습니다: ${input.srt}`);
        const artifactId = input.artifact || 'whiteboard';
        const existing = (ctx.manifest.artifacts || []).find((a) => a.id === artifactId);
        const irRel = existing?.ir || `ir/${artifactId}.json`;
        const { ir, plan, warnings } = planWhiteboardIr(fs.readFileSync(abs), {
          id: artifactId,
          title: existing?.title || '화이트보드 영상',
          mode: input.mode,
          ...(input.targetSec ? { targetMs: input.targetSec * 1000 } : {}),
          srtPath: path.relative(ctx.dir, abs).split(path.sep).join('/'),
        });
        const r = validateArtifactIr(ir);
        if (!r.valid) return errs(EXIT.SCHEMA_INVALID, r.errors.map((e) => ({ where: e.path, message: e.message })));
        writeJson(path.resolve(ctx.dir, irRel), ir);
        if (!existing) ctx.manifest.artifacts.push({ id: artifactId, type: 'video', title: ir.title, ir: irRel, status: 'planned', outputs: [] });
        else existing.status = 'planned';
        saveProject(ctx, { command: 'api plan (srt)' });
        return ok({ created: [artifactId], scenes: plan.scenes, language: plan.lang, totalMs: plan.totalMs, warnings, nextOp: 'inspect' });
      }

      const created = [];
      for (const ref of ctx.manifest.artifacts || []) {
        const irPath = path.resolve(ctx.dir, ref.ir);
        if (fs.existsSync(irPath) && !input.force) continue;
        const ir = newArtifactIr(ref, ctx.manifest);
        const r = validateArtifactIr(ir);
        if (!r.valid) return errs(EXIT.SCHEMA_INVALID, r.errors.map((e) => ({ where: `${ref.id}.${e.path}`, message: e.message })));
        writeJson(irPath, ir);
        created.push(ref.id);
      }
      saveProject(ctx, { command: 'api plan' });
      const blocked = checkGates(ctx.manifest, 'build');
      return ok({
        created,
        skipped: (ctx.manifest.artifacts || []).map((a) => a.id).filter((id) => !created.includes(id)),
        gateBlocked: blocked.ok ? null : blocked.blocked,
        nextOp: blocked.ok ? 'generate' : 'approve',
      });
    },
  },

  /* 만들기 */
  generate: {
    title: '빌드 · 렌더',
    description:
      '자산 해시를 갱신하고 IR을 검증한 뒤 HTML로 렌더링한다. 변경되지 않은 산출물은 건너뛴다. ' +
      '승인 게이트(direction, outline)를 통과하지 못하면 시작하지 않는다.',
    schema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        artifact: { type: 'string', description: '특정 산출물만' },
        force: { type: 'boolean', description: '캐시를 무시하고 다시 렌더' },
        out: { type: 'string', default: 'out' },
      },
    },
    run(input) {
      const { ctx, fail } = open(input);
      if (fail) return fail;

      const gates = checkGates(ctx.manifest, 'render');
      if (!gates.ok) {
        return errs(EXIT.GATE_BLOCKED, gates.blocked.map((g) => ({ where: g.gate, message: `${g.state} — ${GATE_HELP[g.gate] || ''}` })), {
          blockedGates: gates.blocked,
          hint: 'approve 작업으로 사용자 확인을 기록한 뒤 다시 부르세요.',
        });
      }

      // build 단계: 자산 해시와 IR 검증
      const schemaErrors = [];
      for (const asset of ctx.manifest.assets || []) {
        const abs = path.resolve(ctx.dir, asset.path);
        if (!fs.existsSync(abs)) continue;
        const hash = sha256File(abs);
        if (asset.sha256 !== hash) { asset.sha256 = hash; asset.bytes = fs.statSync(abs).size; }
      }
      for (const ref of ctx.manifest.artifacts || []) {
        const { ir } = loadArtifactIr(ctx, ref);
        if (!ir) { schemaErrors.push({ where: ref.id, message: `IR 파일 없음: ${ref.ir}` }); continue; }
        for (const e of validateArtifactIr(ir).errors) schemaErrors.push({ where: `${ref.id}.${e.path}`, message: e.message });
        if (ref.status === 'planned') ref.status = 'built';
      }
      if (schemaErrors.length) return errs(EXIT.SCHEMA_INVALID, schemaErrors);

      // render 단계
      const diff = diffInputs(ctx);
      const dirty = diff.changed.length + diff.added.length + diff.removed.length > 0;
      const outRoot = path.resolve(ctx.dir, input.out || 'out');
      const rendered = [];
      const skipped = [];

      for (const ref of ctx.manifest.artifacts || []) {
        if (input.artifact && ref.id !== input.artifact) continue;
        const { ir } = loadArtifactIr(ctx, ref);
        if (!ir) continue;
        if (!input.force && isArtifactFresh(ctx, ref, dirty)) { skipped.push(ref.id); continue; }
        const outputs = renderArtifactHtml(ctx, ref, ir, path.join(outRoot, ref.id)).map((o) => stampOutput(ctx, o));
        ref.outputs = [...(ref.outputs || []).filter((o) => o.format !== 'html'), ...outputs];
        ref.status = 'rendered';
        rendered.push({ id: ref.id, files: outputs.map((o) => ({ path: o.path, bytes: o.bytes })) });
      }

      commitInputCache(ctx, diff.current);
      saveProject(ctx, { command: 'api generate' });
      return ok({ rendered, skipped, nextOp: 'verify' });
    },
  },

  /* 고치기 */
  revise: {
    title: '구조적 편집',
    description:
      'IR을 통째로 다시 쓰지 않고 바꿀 것만 말한다. 연산은 원자적으로 적용된다 — 하나라도 검사에 걸리면 ' +
      '아무것도 바뀌지 않는다. 적용 전 체크포인트가 자동으로 찍힌다.\n' +
      `가능한 연산: ${Object.entries(OPERATIONS).map(([k, v]) => `${k}(${v.args.join(', ')}) ${v.desc}`).join(' · ')}`,
    schema: {
      type: 'object',
      required: ['operations'],
      properties: {
        project: { type: 'string' },
        operations: {
          type: 'array',
          minItems: 1,
          description: '연산 목록. 각 항목은 { op, ... } 형태.',
          items: { type: 'object', required: ['op'], properties: { op: { enum: Object.keys(OPERATIONS) } } },
        },
        dryRun: { type: 'boolean', description: '검사만 하고 쓰지 않는다' },
        note: { type: 'string', description: '체크포인트 라벨' },
      },
    },
    run(input) {
      const { ctx, fail } = open(input);
      if (fail) return fail;

      let checkpoint = null;
      if (!input.dryRun) checkpoint = createCheckpoint(ctx, { label: input.note || 'api revise 직전', auto: true });

      const result = applyOperations(ctx, input.operations, { dryRun: input.dryRun });
      if (!result.ok) {
        return errs(EXIT.SCHEMA_INVALID, result.errors, {
          applied: result.applied,
          hint: '아무것도 바뀌지 않았습니다. 연산을 고쳐 다시 부르세요.',
          ...(checkpoint ? { checkpoint: checkpoint.id } : {}),
        });
      }
      if (input.dryRun) return ok({ dryRun: true, applied: result.applied, changedArtifacts: result.changedArtifacts });

      saveProject(ctx, { command: 'api revise', note: `${result.applied.length}개 연산` });
      return ok({
        applied: result.applied,
        changedArtifacts: result.changedArtifacts,
        checkpoint: checkpoint.id,
        nextOp: 'generate',
        hint: '편집한 산출물은 stale입니다. generate로 다시 렌더하세요.',
      });
    },
  },

  /* 검사 */
  verify: {
    title: '품질 게이트',
    description:
      '스키마·출처·디자인·미디어 검사를 돌리고 qa.json과 qa-report.html을 남긴다. ' +
      '오류가 있으면 ok=false와 code=4로 돌아온다.',
    schema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        strict: { type: 'boolean', description: '경고도 실패로 처리' },
        only: { type: 'array', items: { enum: ['structure', 'provenance', 'design', 'media'] } },
      },
    },
    run(input) {
      const { ctx, fail } = open(input);
      if (fail) return fail;
      const report = runQa(ctx, { only: input.only?.length ? input.only : null, strict: !!input.strict });
      const { jsonPath, htmlPath } = writeQaArtifacts(ctx, report);
      saveProject(ctx, { command: 'api verify', result: report.status === 'fail' ? 'fail' : 'ok' });

      const findings = report.groups.flatMap((g) => g.findings.map((f) => ({ group: g.id, ...f })));
      const payload = {
        status: report.status,
        summary: report.summary,
        findings,
        reportPath: path.relative(ctx.dir, htmlPath).split(path.sep).join('/'),
        jsonPath: path.relative(ctx.dir, jsonPath).split(path.sep).join('/'),
      };
      return report.status === 'fail'
        ? { ok: false, code: EXIT.QA_FAILED, errors: findings.filter((f) => f.level === 'error'), ...payload }
        : ok(payload);
    },
  },

  /* 내보내기 */
  export: {
    title: '포맷 내보내기',
    description:
      'HTML을 pptx·pdf·mp4로 내보낸다. 무거운 포맷이라 기존 scripts/에 위임하며, 필요한 패키지가 없으면 code=5로 알린다. ' +
      'draft 승인이 필요하다.',
    schema: {
      type: 'object',
      required: ['format'],
      properties: {
        project: { type: 'string' },
        format: { enum: ['pptx', 'pdf', 'mp4'] },
        artifact: { type: 'string' },
        out: { type: 'string', default: 'out' },
      },
    },
    run(input) {
      const { ctx, fail } = open(input);
      if (fail) return fail;
      const gates = checkGates(ctx.manifest, 'export');
      if (!gates.ok) {
        return errs(EXIT.GATE_BLOCKED, gates.blocked.map((g) => ({ where: g.gate, message: g.state })), { blockedGates: gates.blocked });
      }

      const EXPORTERS = {
        pptx: { script: 'scripts/export_deck_pptx.mjs', needs: ['pptxgenjs', 'playwright'], types: ['deck'] },
        pdf: { script: 'scripts/export_deck_pdf.mjs', needs: ['playwright'], types: ['deck', 'html', 'infographic'] },
        mp4: { script: 'scripts/render-video-seek.js', needs: ['playwright'], types: ['video'] },
      };
      const exporter = EXPORTERS[input.format];
      const scriptPath = path.join(repoRoot(), exporter.script);
      if (!fs.existsSync(scriptPath)) return err(EXIT.MISSING_DEPENDENCY, `내보내기 스크립트가 없습니다: ${exporter.script}`);

      const targets = (ctx.manifest.artifacts || []).filter(
        (a) => exporter.types.includes(a.type) && (!input.artifact || a.id === input.artifact)
      );
      if (targets.length === 0) return err(EXIT.USAGE, `${input.format}로 내보낼 산출물이 없습니다 (${exporter.types.join('/')} 타입만 지원)`);

      const exported = [];
      for (const ref of targets) {
        const html = (ref.outputs || []).find((o) => o.format === 'html');
        if (!html) return err(EXIT.NOT_FOUND, `${ref.id}: 먼저 generate로 HTML을 만들어야 합니다`);
        const outAbs = path.resolve(ctx.dir, input.out || 'out', ref.id, `${ref.id}.${input.format}`);
        fs.mkdirSync(path.dirname(outAbs), { recursive: true });
        const proc = spawnSync(process.execPath, [scriptPath, path.resolve(ctx.dir, html.path), outAbs], {
          cwd: repoRoot(), encoding: 'utf8',
        });
        if (proc.status !== 0 || !fs.existsSync(outAbs)) {
          return err(EXIT.MISSING_DEPENDENCY, `${ref.id}: ${input.format} 내보내기 실패. 필요한 패키지: ${exporter.needs.join(', ')}`, {
            stderr: (proc.stderr || '').slice(-800),
            install: `npm install ${exporter.needs.join(' ')}`,
          });
        }
        const rel = path.relative(ctx.dir, outAbs).split(path.sep).join('/');
        ref.outputs = [...(ref.outputs || []).filter((o) => o.format !== input.format), stampOutput(ctx, { path: rel, format: input.format })];
        ref.status = 'exported';
        exported.push({ id: ref.id, path: rel });
      }
      saveProject(ctx, { command: `api export ${input.format}` });
      return ok({ exported, nextOp: 'verify' });
    },
  },

  /* 합의 기록 */
  approve: {
    title: '승인 게이트 기록',
    description:
      '사용자 확인을 기록한다. direction은 초안 3개의 증거가 필요하고, 면제(waive)는 사용자 원문을 note로 남겨야 한다. ' +
      '에이전트가 사용자 확인 없이 부르면 안 되는 작업이다.',
    schema: {
      type: 'object',
      required: ['gate'],
      properties: {
        project: { type: 'string' },
        gate: { enum: ['facts', 'assets', 'direction', 'outline', 'draft', 'final'] },
        state: { enum: ['approved', 'waived', 'rejected'], default: 'approved' },
        note: { type: 'string', description: '사용자 원문' },
        evidence: { type: 'array', items: { type: 'string' }, description: '초안·시안 파일 경로' },
        by: { type: 'string' },
      },
    },
    run(input) {
      const { ctx, fail } = open(input);
      if (fail) return fail;
      const state = input.state || 'approved';
      const evidence = input.evidence || [];

      if (state === 'approved' && input.gate === 'direction' && evidence.length < 3) {
        return err(EXIT.GATE_BLOCKED, '삼방향 게이트는 초안 3개의 증거가 필요합니다. 사용자에게 세 방향을 보여주고 선택을 받으세요.');
      }
      if (state === 'waived' && !input.note) {
        return err(EXIT.USAGE, '면제는 사용자 원문을 note로 남겨야 합니다. 감사 로그가 없는 면제는 허용하지 않습니다.');
      }

      const missing = evidence.filter((e) => !fs.existsSync(path.resolve(ctx.dir, e)));
      ctx.manifest.approvals = ctx.manifest.approvals || {};
      ctx.manifest.approvals[input.gate] = {
        state, at: nowIso(),
        ...(input.by ? { by: input.by } : {}),
        ...(input.note ? { note: input.note } : {}),
        ...(evidence.length ? { evidence } : {}),
      };
      saveProject(ctx, { command: `api approve ${input.gate} (${state})` });
      const cp = (state === 'approved' || state === 'waived') ? createCheckpoint(ctx, { label: `${input.gate} ${state}`, auto: true }) : null;

      return ok({
        gate: input.gate, state,
        missingEvidence: missing,
        checkpoint: cp?.id || null,
        unlocked: ['build', 'render', 'export'].filter((cmd) => checkGates(ctx.manifest, cmd).ok),
      });
    },
  },

  /* 되돌리기 */
  checkpoint: {
    title: '체크포인트',
    description: '작업 스냅샷을 만들고, 목록을 보고, 되돌리고, 무엇이 달라졌는지 본다. 담는 것은 매니페스트와 IR뿐이다.',
    schema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        action: { enum: ['create', 'list', 'restore', 'diff'], default: 'list' },
        ref: { type: 'string', description: 'restore·diff 대상 (id 또는 last)' },
        label: { type: 'string' },
      },
    },
    run(input) {
      const { ctx, fail } = open(input);
      if (fail) return fail;
      const action = input.action || 'list';

      if (action === 'create') {
        const meta = createCheckpoint(ctx, { label: input.label || '' });
        return ok({ created: meta.id, label: meta.label, files: Object.keys(meta.files) });
      }
      if (action === 'list') {
        return ok({ checkpoints: listCheckpoints(ctx).map((c) => ({ id: c.id, at: c.at, label: c.label, auto: c.auto, qa: c.qa })) });
      }
      const meta = findCheckpoint(ctx, input.ref);
      if (!meta) return err(EXIT.NOT_FOUND, `체크포인트를 찾을 수 없습니다: ${input.ref || 'last'}`);

      if (action === 'diff') return ok({ from: meta.id, label: meta.label, changes: diffCheckpoint(ctx, meta) });

      const { restored, safety } = restoreCheckpoint(ctx, meta);
      return ok({ restored: meta.id, files: restored, safetyCheckpoint: safety.id, nextOp: 'generate' });
    },
  },

  /* 스타일 고르기 */
  styles: {
    title: '스타일 레지스트리',
    description:
      '스타일 60종을 조건으로 좁히거나(action=search), 한 종을 자세히 보거나(show), ' +
      '삼방향 후보를 받거나(suggest), 고른 결과를 매니페스트에 기록한다(apply). ' +
      'suggest는 온도(대담·중성·차분)가 겹치지 않는 세 개를 보장한다 — 셋 다 조용한 것이 가장 흔한 실패 모드다. ' +
      'apply는 예시 색을 토큰에 자동 반영하지 않는다: 문서의 hex는 배합표가 아니라 앵커이고, 색은 브랜드·내용·맥락에서 유도해야 한다.',
    schema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        action: { enum: ['search', 'show', 'suggest', 'apply'], default: 'search' },
        id: { type: 'string', description: 'show·apply 대상 스타일 id' },
        supports: { type: 'array', items: { enum: ['html', 'deck', 'video', 'infographic', 'image'] } },
        section: { enum: ['web', 'deck', 'infographic'] },
        temperature: { type: 'array', items: { enum: ['bold', 'neutral', 'quiet'] } },
        contrast: { type: 'array', items: { enum: ['light', 'dark', 'mixed', 'unknown'] } },
        motionLevel: { type: 'array', items: { enum: ['none', 'subtle', 'moderate', 'expressive'] } },
        minFidelity: { type: 'number', minimum: 0, maximum: 100 },
        text: { type: 'string', description: '이름·용도·DNA·참고사례를 함께 훑는 검색어 (원문이 중국어다)' },
        limit: { type: 'number' },
        seed: { type: 'string', description: 'suggest 재현용 씨앗. 같은 씨앗은 같은 후보를 낸다.' },
        rationale: { type: 'string', description: 'apply에 필수 — 왜 이 방향인지' },
        evidence: { type: 'array', items: { type: 'string' }, description: 'apply에 넘길 초안 3개 경로' },
      },
    },
    readOnly: false,
    run(input) {
      const action = input.action || 'search';
      let registry;
      try {
        registry = loadRegistry();
      } catch (e) {
        return err(EXIT.NOT_FOUND, e.message);
      }
      const stale = isStale(registry);

      if (action === 'search') {
        const found = searchStyles(input, registry);
        return ok({
          total: registry.styles.length,
          matched: found.length,
          stale: stale.stale ? stale.reason : null,
          styles: found.map((s) => ({
            id: s.id, name: s.name, section: s.section, supports: s.supports,
            temperature: s.temperature, fidelity: s.fidelity, contrast: s.contrast,
            motionLevel: s.motionLevel, audiences: s.audiences,
          })),
        });
      }

      if (action === 'show') {
        if (!input.id) return err(EXIT.USAGE, 'id가 필요합니다');
        const style = getStyle(input.id, registry);
        if (!style) {
          const near = [...findSimilar(input.id, {}, registry).map((s) => s.id), ...searchStyles({ text: input.id, limit: 3 }, registry).map((s) => s.id)];
          return err(EXIT.NOT_FOUND, `스타일을 찾을 수 없습니다: ${input.id}${near.length ? `. 비슷한 것: ${near.join(', ')}` : ''}`);
        }
        return ok({
          style,
          paletteNote: '예시 색은 배합표가 아니라 앵커입니다. 그대로 복사하면 slop이 됩니다 — 브랜드 자산·내용·문화 맥락에서 유도하세요.',
          ...(style.fidelity < 70
            ? { fidelityWarning: `재현도 ${style.fidelity}% — 어느 부분을 단색으로 낮췄는지 산출물에 밝혀야 합니다.` }
            : {}),
        });
      }

      if (action === 'suggest') {
        let brief = { deliverables: input.supports, text: input.text, seed: input.seed, minFidelity: input.minFidelity };
        const opened = open(input);
        if (!opened.fail) {
          brief = {
            ...brief,
            deliverables: brief.deliverables?.length ? brief.deliverables : opened.ctx.manifest.brief?.deliverables || [],
            projectId: opened.ctx.manifest.id,
          };
        }
        const result = suggestDirections(brief, registry);
        return ok({
          ...result,
          candidates: result.candidates.map((cd) => ({
            role: cd.role, roleWhy: cd.roleWhy, temperature: cd.temperature,
            id: cd.style.id, name: cd.style.name, fidelity: cd.style.fidelity,
            contrast: cd.style.contrast, motionLevel: cd.style.motionLevel,
            audiences: cd.style.audiences, dna: cd.style.dna, html: cd.style.html,
            fonts: cd.style.fonts, palette: cd.style.palette,
          })),
          nextStep:
            '이 세 방향으로 **실제 초안**을 만들어 사용자에게 보여주세요. 목록만 보여주고 고르라고 하면 삼방향 게이트가 아닙니다.',
        });
      }

      // apply
      const { ctx, fail } = open(input);
      if (fail) return fail;
      if (!input.id) return err(EXIT.USAGE, 'id가 필요합니다');
      const style = getStyle(input.id, registry);
      if (!style) {
        const near = findSimilar(input.id, {}, registry).map((s) => s.id);
        return err(EXIT.NOT_FOUND, `스타일을 찾을 수 없습니다: ${input.id}${near.length ? `. 혹시: ${near.join(', ')}` : ''}`);
      }
      if (!input.rationale || String(input.rationale).length < 8) {
        return err(EXIT.USAGE, 'rationale이 필요합니다. 왜 이 방향인지 한 문장으로 적으세요. 근거 없는 선택은 검수에서 걸립니다.');
      }

      const entry = buildStyleEntry(style, { rationale: String(input.rationale) });
      const evidence = input.evidence || [];
      if (evidence.length) {
        entry.candidates = evidence.map((p, i) => ({
          id: `dir-${'abc'[i] || i}`,
          label: `방향 ${'ABC'[i] || i + 1}`,
          preview: p,
          ...(i === 0 ? { chosen: true } : {}),
        }));
      }
      entry.lockedAt = nowIso();
      ctx.manifest.style = entry;
      saveProject(ctx, { command: `api styles apply ${input.id}` });

      return ok({
        applied: style.id,
        name: style.name,
        palette: style.palette,
        paletteNote: '토큰에 자동 반영하지 않았습니다. 색은 브랜드·내용·맥락에서 유도한 뒤 revise의 setToken으로 넣으세요.',
        ...(style.fidelity < 70 ? { fidelityWarning: `재현도 ${style.fidelity}%` } : {}),
        nextOp: 'approve',
        hint: 'approve gate=direction 에 초안 3개의 증거를 함께 넘기세요.',
      });
    },
  },

  /* 편집기에서 온 요청 */
  revisionQueue: {
    title: '수정 요청 큐',
    description:
      'Studio 편집기에서 사용자가 남긴 수정 요청을 읽고 완료 처리한다. ' +
      '사용자가 "이건 AI가 고쳐줘"라고 표시한 것들이다.',
    schema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        action: { enum: ['list', 'done'], default: 'list' },
        ids: { type: 'array', items: { type: 'string' }, description: 'done 대상 (["all"]도 가능)' },
      },
    },
    run(input) {
      const { ctx, fail } = open(input);
      if (fail) return fail;
      const file = path.resolve(ctx.dir, REVISIONS);
      const store = fs.existsSync(file) ? readJson(file) : { items: [] };

      if ((input.action || 'list') === 'done') {
        const ids = input.ids || [];
        let n = 0;
        for (const item of store.items) {
          if (ids.includes(item.id) || ids.includes('all')) { item.status = 'done'; item.doneAt = nowIso(); n += 1; }
        }
        writeJson(file, store);
        return ok({ completed: n, remaining: store.items.filter((r) => r.status !== 'done').length });
      }
      return ok({ requests: store.items.filter((r) => r.status !== 'done') });
    },
  },
};

function summarize(id, kind, blocks, extra = {}) {
  return {
    id, kind,
    blocks: (blocks || []).map((b) => ({
      id: b.id, kind: b.kind,
      text: b.text ? (b.text.length > 90 ? `${b.text.slice(0, 90)}…` : b.text) : undefined,
      items: b.items?.length,
      box: b.box,
      style: b.style,
      claims: b.claims?.length || undefined,
      assetId: b.assetId,
    })),
    ...extra,
  };
}

function readRevisions(ctx) {
  const file = path.resolve(ctx.dir, REVISIONS);
  if (!fs.existsSync(file)) return [];
  try {
    return readJson(file).items || [];
  } catch {
    return [];
  }
}

/**
 * 작업 하나를 실행한다. 예외는 밖으로 새지 않는다 —
 * MCP도 REST도 프로토콜 오류가 아니라 구조화된 실패를 원한다.
 */
export function runOperation(name, input = {}) {
  const op = operations[name];
  if (!op) return err(EXIT.USAGE, `알 수 없는 작업: ${name}. 가능: ${Object.keys(operations).join(', ')}`);
  try {
    return op.run(input || {});
  } catch (e) {
    return err(e.exitCode || EXIT.USAGE, e.message, { stack: process.env.DESIGN_DEBUG ? e.stack : undefined });
  }
}

/** 종료 코드 → HTTP 상태. 세 표면이 같은 어휘를 쓰기 위한 매핑. */
export const HTTP_STATUS = {
  [EXIT.OK]: 200,
  [EXIT.USAGE]: 400,
  [EXIT.SCHEMA_INVALID]: 422,
  [EXIT.GATE_BLOCKED]: 409,
  [EXIT.QA_FAILED]: 422,
  [EXIT.MISSING_DEPENDENCY]: 501,
  [EXIT.NOT_FOUND]: 404,
};
