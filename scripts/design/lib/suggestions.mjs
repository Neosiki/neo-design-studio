import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { nowIso, readJson, writeJson } from './util.mjs';

const RULES = {
  'layout.safeArea': { title: '안전 영역 안으로 자동 배치 제안', action: 'setRegion', reason: '화면 밖으로 노출될 수 있는 요소의 위치를 안전 영역 안으로 조정합니다.' },
  'layout.canvas': { title: '캔버스 안으로 위치 조정 제안', action: 'setRegion', reason: '캔버스 경계를 넘은 레이어의 위치를 유효 범위로 보정합니다.' },
  'color.contrast': { title: '대비가 높은 색상 조합 제안', action: 'setToken', reason: '전경색과 배경색의 대비를 높이는 토큰 후보를 제안합니다.' },
  'type.minSize': { title: '본문 글자 크기 확대 제안', action: 'setToken', reason: '읽기 어려운 작은 텍스트를 프로젝트 최소 글자 크기에 맞춥니다.' },
  'a11y.alt.block': { title: '대체 텍스트 초안 제안', action: 'setText', reason: '이미지·시각 요소의 의미를 설명하는 대체 텍스트 초안을 만듭니다.' },
  'a11y.captions': { title: '자막 트랙 연결 제안', action: 'setCaption', reason: '음성 콘텐츠에 대응하는 자막 트랙 연결을 제안합니다.' },
  'content.placeholder': { title: '자리표시자 교체 제안', action: 'setText', reason: '초기 스캐폴드 문구를 실제 콘텐츠로 교체해야 합니다.' },
};

export function buildSuggestions(report) {
  const findings = (report?.groups || []).flatMap((g) => g.findings || [])
    .filter((f) => f.level === 'error' || f.level === 'warn');
  const seen = new Set();
  const out = [];
  for (const finding of findings) {
    const rule = RULES[finding.check];
    const key = `${finding.check}:${finding.where}`;
    if (!rule || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `suggest-${out.length + 1}`,
      check: finding.check,
      where: finding.where,
      level: finding.level,
      title: rule.title,
      reason: rule.reason,
      action: rule.action,
      source: finding.message,
      requiresApproval: true,
      patch: { op: rule.action, target: finding.where, previewOnly: true },
    });
  }
  return out;
}

export function previewSuggestion(suggestion, options = {}) {
  return {
    id: suggestion.id,
    title: suggestion.title,
    target: suggestion.where,
    before: suggestion.source,
    proposed: suggestion.reason,
    patch: { ...suggestion.patch, ...(options.sourceFile ? { sourceFile: options.sourceFile } : {}), ...(options.jsonPath ? { jsonPath: options.jsonPath } : {}), ...(Object.hasOwn(options, 'value') ? { value: options.value } : {}) },
    requiresApproval: true,
    applied: false,
  };
}

function resolveSafeSource(ctx, sourceFile) {
  if (!sourceFile || typeof sourceFile !== 'string') throw new Error('적용할 JSON 소스 파일을 지정해야 합니다.');
  const root = path.resolve(ctx.dir);
  const target = path.resolve(root, sourceFile);
  if (!target.startsWith(`${root}${path.sep}`) || path.extname(target).toLowerCase() !== '.json') {
    throw new Error('제안 적용 대상은 프로젝트 내부의 JSON 파일이어야 합니다.');
  }
  if (!fs.existsSync(target)) throw new Error(`소스 파일을 찾을 수 없습니다: ${sourceFile}`);
  return target;
}

function pointerParts(pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/') || pointer.includes('/__proto__') || pointer.includes('/constructor') || pointer.includes('/prototype')) {
    throw new Error('JSON 경로는 안전한 JSON Pointer 형식이어야 합니다.');
  }
  return pointer.slice(1).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function readAt(root, parts) {
  let current = root;
  for (const part of parts) current = current?.[part];
  return current;
}

function writeAt(root, parts, value) {
  if (!parts.length) throw new Error('루트 전체 교체는 지원하지 않습니다.');
  let current = root;
  for (const part of parts.slice(0, -1)) {
    if (!current || typeof current !== 'object' || !(part in current)) throw new Error(`JSON 경로를 찾을 수 없습니다: /${parts.join('/')}`);
    current = current[part];
  }
  const last = parts.at(-1);
  if (!current || typeof current !== 'object' || !(last in current)) throw new Error(`JSON 경로를 찾을 수 없습니다: /${parts.join('/')}`);
  current[last] = value;
}

export function applySuggestion(ctx, suggestion, { sourceFile, jsonPath, value, approved = false } = {}) {
  if (!approved) return { ...previewSuggestion(suggestion, { sourceFile, jsonPath, value }), applied: false, approvalRequired: true };
  const target = resolveSafeSource(ctx, sourceFile);
  const parts = pointerParts(jsonPath);
  const document = readJson(target);
  const before = readAt(document, parts);
  if (typeof value === 'undefined') throw new Error('적용할 새 값을 지정해야 합니다.');
  const backupDir = path.join(ctx.dir, '.design', 'suggestion-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`);
  fs.copyFileSync(target, backup);
  writeAt(document, parts, value);
  writeJson(target, document);
  return { id: suggestion.id, applied: true, sourceFile: path.relative(ctx.dir, target), jsonPath, before, after: value, backup: path.relative(ctx.dir, backup), appliedAt: nowIso() };
}
