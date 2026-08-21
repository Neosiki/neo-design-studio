/**
 * styles/cli.mjs — design styles <list|search|show|suggest|apply|rebuild>
 */

import fs from 'node:fs';
import path from 'node:path';
import { EXIT, log, c, writeJson, repoRoot } from '../util.mjs';
import { validate } from '../schema.mjs';
import { readJson } from '../util.mjs';
import { loadProject, saveProject } from '../project.mjs';
import { extractStyles, extractShowcases } from './extract.mjs';
import { loadRegistry, searchStyles, getStyle, findSimilar, suggestDirections, buildStyleEntry, isStale, sourceHash, REGISTRY_PATH, SOURCE_PATH } from './registry.mjs';

const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

const TEMP_MARK = { bold: c.red('대담'), neutral: c.yellow('중성'), quiet: c.blue('차분') };

function line(s) {
  return `  ${TEMP_MARK[s.temperature] || s.temperature}  ${c.bold(s.id.padEnd(30))} ${String(s.fidelity).padStart(3)}%  ${c.dim(
    `${s.section} · ${s.contrast} · ${s.motionLevel}`
  )}`;
}

/* ── rebuild ──────────────────────────────────────────────────── */

function cmdRebuild() {
  const src = path.join(repoRoot(), SOURCE_PATH);
  if (!fs.existsSync(src)) {
    log.error(`원본 문서가 없습니다: ${SOURCE_PATH}`);
    return EXIT.NOT_FOUND;
  }
  const markdown = fs.readFileSync(src, 'utf8');
  const { styles, stats } = extractStyles(markdown);

  const showcasePath = path.join(repoRoot(), 'assets', 'showcases', 'INDEX.md');
  const showcases = fs.existsSync(showcasePath) ? extractShowcases(fs.readFileSync(showcasePath, 'utf8')) : [];

  if (stats.skipped.length) {
    log.warn(`형태가 다른 항목 ${stats.skipped.length}개를 건너뛰었습니다:`);
    for (const s of stats.skipped) log.hint(`${s.name} — ${s.reason}`);
  }
  if (styles.length === 0) {
    log.error('추출된 스타일이 없습니다. 문서 형식이 바뀌었을 수 있습니다.');
    return EXIT.SCHEMA_INVALID;
  }

  const registry = {
    schemaVersion: '1.0',
    generatedFrom: { path: SOURCE_PATH, sha256: sourceHash(markdown), entries: styles.length },
    styles,
    showcases,
  };

  const schema = readJson(path.join(repoRoot(), 'schemas', 'style.schema.json'));
  const result = validate(registry, schema);
  if (!result.valid) {
    for (const err of result.errors.slice(0, 12)) log.error(`${err.path}: ${err.message}`);
    return EXIT.SCHEMA_INVALID;
  }

  writeJson(path.join(repoRoot(), REGISTRY_PATH), registry);
  log.ok(`레지스트리 생성 → ${REGISTRY_PATH}`);
  log.hint(`스타일 ${styles.length}개 (${Object.entries(stats.bySection).map(([k, v]) => `${k} ${v}`).join(' · ')}) · 예제 장면 ${showcases.length}개`);

  const dist = { bold: 0, neutral: 0, quiet: 0 };
  const contrast = {};
  for (const s of styles) { dist[s.temperature] += 1; contrast[s.contrast] = (contrast[s.contrast] || 0) + 1; }
  log.hint(`온도: 대담 ${dist.bold} · 중성 ${dist.neutral} · 차분 ${dist.quiet}`);
  log.hint(`배경: ${Object.entries(contrast).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  return EXIT.OK;
}

/* ── list · search · show ─────────────────────────────────────── */

function cmdList(args) {
  const registry = loadRegistry();
  const stale = isStale(registry);
  if (stale.stale) log.warn(stale.reason);

  const found = searchStyles(
    {
      supports: list(args.flags.supports),
      section: args.flags.section,
      temperature: list(args.flags.temperature),
      contrast: list(args.flags.contrast),
      motionLevel: list(args.flags.motion),
      minFidelity: args.flags.minFidelity,
      text: args.flags.text || args.positional[1],
      limit: args.flags.limit,
    },
    registry
  );

  if (args.flags.json) { console.log(JSON.stringify(found, null, 2)); return EXIT.OK; }

  console.log(`\n${c.bold(`스타일 ${found.length}개`)} ${c.dim(`(전체 ${registry.styles.length})`)}\n`);
  for (const s of found) console.log(line(s));
  console.log('');
  log.hint('자세히: design styles show <id>   ·   삼방향: design styles suggest');
  return EXIT.OK;
}

function cmdShow(args) {
  const id = args.positional[1];
  if (!id) { log.error('스타일 id가 필요합니다.'); return EXIT.USAGE; }
  const style = getStyle(id);
  if (!style) {
    log.error(`스타일을 찾을 수 없습니다: ${id}`);
    const near = [...findSimilar(id), ...searchStyles({ text: id, limit: 5 })];
    const ids = [...new Set(near.map((s) => s.id))].slice(0, 5);
    if (ids.length) log.hint(`비슷한 것: ${ids.join(', ')}`);
    return EXIT.NOT_FOUND;
  }
  if (args.flags.json) { console.log(JSON.stringify(style, null, 2)); return EXIT.OK; }

  console.log(`\n${c.bold(style.name)}`);
  console.log(c.dim(`${style.id} · ${style.section} · ${TEMP_MARK[style.temperature]} · 재현도 ${style.fidelity}% · 배경 ${style.contrast} · 모션 ${style.motionLevel}`));
  console.log(`\n${c.bold('용도')}\n  ${style.audiences.join(' · ')}`);
  console.log(`\n${c.bold('참고 사례')}\n  ${style.references}`);
  console.log(`\n${c.bold('시각 DNA')}\n  ${style.dna}`);
  console.log(`\n${c.bold('HTML 구현')}\n  ${style.html}`);
  console.log(`\n${c.bold('글꼴')}\n  ${style.fontNote}`);
  if (style.palette.length) {
    console.log(`\n${c.bold('예시 색')}\n  ${style.palette.join('  ')}`);
    console.log(c.dim('  ⚠ 배합표가 아니라 앵커입니다. 그대로 복사하면 100명이 같은 색을 씁니다 —'));
    console.log(c.dim('     브랜드 자산·내용·문화 맥락에서 유도하세요 (design-styles.md 색채 유도 규약).'));
  }
  if (style.fidelity < 70) {
    console.log(`\n${c.yellow('!')} 재현도 ${style.fidelity}% — 어느 부분을 단색으로 낮췄는지 산출물에 밝혀야 합니다.`);
  }
  console.log('');
  return EXIT.OK;
}

/* ── suggest ──────────────────────────────────────────────────── */

function cmdSuggest(args) {
  let brief = {
    deliverables: list(args.flags.deliverables),
    text: args.flags.text,
    seed: args.flags.seed,
    minFidelity: args.flags.minFidelity ? Number(args.flags.minFidelity) : undefined,
  };

  // 프로젝트 안에서 부르면 브리프를 읽어 쓴다
  let ctx = null;
  if (!args.flags.noProject) {
    try {
      ctx = loadProject(args.flags.project);
      brief = {
        ...brief,
        deliverables: brief.deliverables.length ? brief.deliverables : ctx.manifest.brief?.deliverables || [],
        projectId: ctx.manifest.id,
        text: brief.text || undefined,
      };
    } catch {
      /* 프로젝트 밖에서도 쓸 수 있다 */
    }
  }

  const result = suggestDirections(brief);
  if (args.flags.json) { console.log(JSON.stringify(result, null, 2)); return EXIT.OK; }

  console.log(`\n${c.bold('삼방향 후보')} ${c.dim(`(후보군 ${result.poolSize}개에서)`)}\n`);
  for (const cand of result.candidates) {
    console.log(`${c.bold(cand.role)}  ${TEMP_MARK[cand.temperature]}`);
    console.log(`  ${c.bold(cand.style.name)}`);
    console.log(c.dim(`  ${cand.style.id} · 재현도 ${cand.style.fidelity}% · 배경 ${cand.style.contrast} · ${cand.roleWhy}`));
    console.log(c.dim(`  용도: ${cand.style.audiences.slice(0, 5).join(' · ')}`));
    console.log('');
  }

  console.log(c.dim(`온도: ${result.diversity.temperatures.join(' / ')}   배경: ${result.diversity.contrasts.join(' / ')}`));
  for (const w of result.warnings) log.warn(w);

  console.log('');
  log.info(`${c.bold('다음')}: 이 세 방향으로 ${c.bold('실제 초안')}을 만들어 사용자에게 보여주세요.`);
  log.hint('목록만 보여주고 고르라고 하면 삼방향 게이트가 아닙니다 — 진짜 시안이어야 합니다.');
  log.hint(`고른 뒤: design styles apply <id> --rationale "왜 이 방향인지" --evidence a.html,b.html,c.html`);
  return EXIT.OK;
}

/* ── apply ────────────────────────────────────────────────────── */

function cmdApply(args) {
  const id = args.positional[1];
  if (!id) { log.error('스타일 id가 필요합니다.'); return EXIT.USAGE; }
  const style = getStyle(id);
  if (!style) { log.error(`스타일을 찾을 수 없습니다: ${id}`); return EXIT.NOT_FOUND; }

  const rationale = args.flags.rationale;
  if (!rationale || String(rationale).length < 8) {
    log.error('--rationale 이 필요합니다. 왜 이 방향인지 한 문장으로 적으세요.');
    log.hint('근거 없는 스타일 선택은 검수에서 style.rationale 위반으로 걸립니다.');
    return EXIT.USAGE;
  }

  const ctx = loadProject(args.flags.project);
  const evidence = list(args.flags.evidence);

  const entry = buildStyleEntry(style, { rationale: String(rationale) });
  if (evidence.length) {
    entry.candidates = evidence.map((p, i) => ({
      id: `dir-${'abc'[i] || i}`,
      label: `방향 ${'ABC'[i] || i + 1}`,
      preview: p,
      ...(i === (Number(args.flags.chosen) || 0) ? { chosen: true } : {}),
    }));
  }
  entry.lockedAt = new Date().toISOString();

  ctx.manifest.style = entry;
  saveProject(ctx, { command: `styles apply ${id}` });

  log.ok(`스타일 적용: ${style.name}`);
  log.hint(`재현도 ${style.fidelity}% · 배경 ${style.contrast} · 모션 ${style.motionLevel}`);
  if (style.palette.length) {
    console.log('');
    log.step('예시 색 (참고용, 토큰에 자동 반영하지 않았습니다)');
    log.hint(style.palette.join('  '));
    log.hint('색은 브랜드 자산·내용·문화 맥락에서 유도하세요. 앵커를 복사하면 slop이 됩니다.');
    log.hint(`토큰을 직접 정하려면: design studio (편집기) 또는 revise 연산 setToken`);
  }
  if (style.fidelity < 70) {
    console.log('');
    log.warn(`재현도 ${style.fidelity}% — 어느 부분을 단색으로 낮췄는지 산출물에 밝혀야 합니다.`);
  }
  console.log('');
  log.info(`다음: ${c.bold('design approve direction --evidence a.html,b.html,c.html --note "사용자 선택 원문"')}`);
  return EXIT.OK;
}

/* ── 진입점 ───────────────────────────────────────────────────── */

const SUB = { list: cmdList, search: cmdList, show: cmdShow, suggest: cmdSuggest, apply: cmdApply, rebuild: cmdRebuild };

export function stylesCommand(args) {
  const sub = args.positional[0] || 'list';
  if (sub === 'help') {
    console.log(`
${c.bold('design styles')} — 스타일 레지스트리 (references/design-styles.md에서 생성)

  list [질의]     조건으로 좁혀 본다
                    --supports html,deck --section web|deck|infographic
                    --temperature bold,neutral,quiet --contrast light,dark,mixed
                    --motion none,subtle,moderate,expressive --minFidelity 90
                    --text <검색어> --limit 10 --json
  show <id>       한 스타일의 DNA·구현·글꼴·예시 색
  suggest         삼방향 후보 — 온도가 겹치지 않는 세 개를 보장한다
                    --deliverables deck --text <주제> --seed <문자열> --json
  apply <id>      고른 스타일을 매니페스트에 기록한다
                    --rationale "왜 이 방향인지" --evidence a.html,b.html,c.html
  rebuild         원본 문서에서 레지스트리를 다시 만든다

${c.dim('레지스트리는 손으로 고치지 않는다. 문서를 고치고 rebuild 한다.')}
${c.dim('항목의 hex는 배합표가 아니라 앵커다 — apply는 토큰을 자동으로 덮어쓰지 않는다.')}
`);
    return EXIT.OK;
  }
  const handler = SUB[sub];
  if (!handler) {
    log.error(`알 수 없는 하위 명령: ${sub}`);
    log.hint(`가능: ${Object.keys(SUB).join(', ')}`);
    return EXIT.USAGE;
  }
  return handler(args);
}
