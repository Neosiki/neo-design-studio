/**
 * report.mjs — qa-report.html 생성 (외부 의존성 없이 단일 파일 HTML)
 */

import fs from 'node:fs';
import path from 'node:path';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const LEVEL_LABEL = { error: '오류', warn: '경고', info: '정보' };
const STATUS_LABEL = { pass: '통과', warn: '경고 있음', fail: '실패' };

export function renderReport(outPath, report) {
  const { summary, status } = report;
  const groupsHtml = report.groups
    .map((group) => {
      const errs = group.findings.filter((f) => f.level === 'error').length;
      const warns = group.findings.filter((f) => f.level === 'warn').length;
      const rows =
        group.findings.length === 0
          ? '<p class="empty">지적 사항 없음</p>'
          : `<table>
  <thead><tr><th>수준</th><th>검사</th><th>위치</th><th>내용</th></tr></thead>
  <tbody>
${group.findings
  .map(
    (f) => `    <tr class="lv-${esc(f.level)}">
      <td><span class="badge ${esc(f.level)}">${LEVEL_LABEL[f.level] || f.level}</span></td>
      <td><code>${esc(f.check)}</code></td>
      <td class="where">${esc(f.where)}</td>
      <td>${esc(f.message)}</td>
    </tr>`
  )
  .join('\n')}
  </tbody>
</table>`;
      return `<section class="group">
  <h2>${esc(group.title)} <small>오류 ${errs} · 경고 ${warns}</small></h2>
  ${rows}
</section>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>검수 보고서 · ${esc(report.project.name || report.project.id)}</title>
<style>
  :root {
    --bg: #0e1116; --surface: #161b22; --line: #262c36;
    --fg: #e6edf3; --muted: #8b949e;
    --pass: #3fb950; --warn: #d29922; --fail: #f85149;
    color-scheme: dark;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg:#ffffff; --surface:#f6f8fa; --line:#d8dee4; --fg:#1f2328; --muted:#636c76;
            --pass:#1a7f37; --warn:#9a6700; --fail:#cf222e; color-scheme: light; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 40px 24px 80px; background: var(--bg); color: var(--fg);
    font: 15px/1.6 -apple-system, "Pretendard", "Noto Sans KR", "Segoe UI", system-ui, sans-serif;
  }
  .wrap { max-width: 1080px; margin: 0 auto; }
  header { border-bottom: 1px solid var(--line); padding-bottom: 24px; margin-bottom: 32px; }
  h1 { font-size: 24px; margin: 0 0 6px; letter-spacing: -0.01em; }
  .meta { color: var(--muted); font-size: 13px; }
  .status { display: inline-flex; align-items: center; gap: 8px; margin-top: 18px;
            padding: 8px 16px; border-radius: 999px; font-weight: 600; font-size: 14px; }
  .status.pass { background: color-mix(in srgb, var(--pass) 16%, transparent); color: var(--pass); }
  .status.warn { background: color-mix(in srgb, var(--warn) 16%, transparent); color: var(--warn); }
  .status.fail { background: color-mix(in srgb, var(--fail) 16%, transparent); color: var(--fail); }
  .tiles { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
  .tile { background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
          padding: 14px 20px; min-width: 110px; }
  .tile b { display: block; font-size: 26px; line-height: 1.2; font-variant-numeric: tabular-nums; }
  .tile span { color: var(--muted); font-size: 12px; }
  section.group { margin-bottom: 36px; }
  h2 { font-size: 17px; margin: 0 0 12px; display: flex; align-items: baseline; gap: 10px; }
  h2 small { font-weight: 400; color: var(--muted); font-size: 12px; }
  table { width: 100%; border-collapse: collapse; background: var(--surface);
          border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--line);
           vertical-align: top; font-size: 13.5px; }
  th { background: color-mix(in srgb, var(--line) 40%, transparent); font-size: 12px;
       color: var(--muted); font-weight: 600; letter-spacing: 0.02em; }
  tr:last-child td { border-bottom: none; }
  td.where { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--muted); }
  .badge { display: inline-block; padding: 2px 9px; border-radius: 6px; font-size: 11.5px; font-weight: 700; }
  .badge.error { background: color-mix(in srgb, var(--fail) 18%, transparent); color: var(--fail); }
  .badge.warn { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }
  .badge.info { background: color-mix(in srgb, var(--muted) 18%, transparent); color: var(--muted); }
  .empty { color: var(--muted); font-size: 13px; margin: 0; padding: 12px 0; }
  footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--line);
           color: var(--muted); font-size: 12px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>검수 보고서</h1>
    <div class="meta">${esc(report.project.name || '')} <code>${esc(report.project.id)}</code> · ${esc(report.ranAt)}${report.strict ? ' · strict 모드' : ''}</div>
    <div class="status ${esc(status)}">${STATUS_LABEL[status] || status}</div>
    <div class="tiles">
      <div class="tile"><b>${summary.errors}</b><span>오류</span></div>
      <div class="tile"><b>${summary.warnings}</b><span>경고</span></div>
      <div class="tile"><b>${summary.checks}</b><span>지적 총계</span></div>
      <div class="tile"><b>${report.groups.length}</b><span>검사 그룹</span></div>
    </div>
  </header>
${groupsHtml}
  <footer>design check · Design Studio 자동 품질 게이트 · 오류가 1건이라도 있으면 명령은 종료 코드 4로 실패합니다.</footer>
</div>
</body>
</html>
`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
  return outPath;
}
