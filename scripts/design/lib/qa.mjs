/**
 * qa.mjs — 검사 실행기. 결과를 qa.json과 qa-report.html로 남긴다.
 */

import path from 'node:path';
import { writeJson, nowIso, log, c } from './util.mjs';
import { renderReport } from './report.mjs';
import * as structure from './checks/structure.mjs';
import * as provenance from './checks/provenance.mjs';
import * as design from './checks/design.mjs';
import * as content from './checks/content.mjs';
import * as typography from './checks/typography.mjs';
import * as a11y from './checks/a11y.mjs';
import * as media from './checks/media.mjs';
import * as security from './checks/security.mjs';

const SUITES = [structure, provenance, content, design, typography, a11y, media, security];

export function runQa(ctx, { only = null, strict = false } = {}) {
  const suites = only ? SUITES.filter((s) => only.includes(s.id)) : SUITES;
  const groups = [];
  let errors = 0;
  let warnings = 0;

  for (const suite of suites) {
    let findings = [];
    try {
      findings = suite.run(ctx) || [];
    } catch (err) {
      findings = [{ check: `${suite.id}.crash`, level: 'error', where: suite.id, message: `검사 실행 실패: ${err.message}` }];
    }
    for (const f of findings) {
      if (f.level === 'error') errors += 1;
      else if (f.level === 'warn') warnings += 1;
    }
    groups.push({ id: suite.id, title: suite.title, findings });
  }

  const status = errors > 0 ? 'fail' : warnings > 0 ? (strict ? 'fail' : 'warn') : 'pass';

  const report = {
    schemaVersion: '1.0',
    project: { id: ctx.manifest.id, name: ctx.manifest.name },
    ranAt: nowIso(),
    strict,
    status,
    summary: { errors, warnings, checks: groups.reduce((n, g) => n + g.findings.length, 0) },
    groups,
  };

  return report;
}

export function writeQaArtifacts(ctx, report) {
  const jsonPath = path.join(ctx.dir, 'qa.json');
  const htmlPath = path.join(ctx.dir, 'qa-report.html');
  writeJson(jsonPath, report);
  renderReport(htmlPath, report);
  ctx.manifest.qa = {
    lastRun: report.ranAt,
    status: report.status,
    errors: report.summary.errors,
    warnings: report.summary.warnings,
    reportPath: 'qa-report.html',
  };
  return { jsonPath, htmlPath };
}

export function printReport(report) {
  for (const group of report.groups) {
    const errs = group.findings.filter((f) => f.level === 'error').length;
    const warns = group.findings.filter((f) => f.level === 'warn').length;
    const mark = errs > 0 ? c.red('✖') : warns > 0 ? c.yellow('!') : c.green('✔');
    console.log(`\n${mark} ${c.bold(group.title)} ${c.dim(`(오류 ${errs} · 경고 ${warns})`)}`);
    for (const f of group.findings) {
      const tag = f.level === 'error' ? c.red('오류') : f.level === 'warn' ? c.yellow('경고') : c.dim('정보');
      console.log(`  ${tag} ${c.dim(`[${f.check}]`)} ${f.where}`);
      console.log(`       ${f.message}`);
    }
  }
  console.log('');
  const { errors, warnings } = report.summary;
  if (report.status === 'pass') log.ok('검수 통과');
  else if (report.status === 'warn') log.warn(`경고 ${warnings}건 — 통과하되 확인이 필요합니다.`);
  else log.error(`검수 실패 — 오류 ${errors}건, 경고 ${warnings}건`);
}
