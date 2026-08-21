/**
 * util.mjs — 로그, 종료 코드, 파일 해시, 색상 계산 공용 유틸
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

/** 종료 코드 규약. 검수 실패가 성공으로 끝나지 않게 만드는 계약. */
export const EXIT = {
  OK: 0,
  USAGE: 1,
  SCHEMA_INVALID: 2,
  GATE_BLOCKED: 3,
  QA_FAILED: 4,
  MISSING_DEPENDENCY: 5,
  NOT_FOUND: 6,
};

const NO_COLOR = process.env.NO_COLOR !== undefined || !process.stdout.isTTY;
const paint = (code) => (s) => (NO_COLOR ? s : `[${code}m${s}[0m`);
export const c = {
  dim: paint(2),
  bold: paint(1),
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  blue: paint(36),
};

export const log = {
  info: (msg) => console.log(msg),
  step: (msg) => console.log(`${c.blue('→')} ${msg}`),
  ok: (msg) => console.log(`${c.green('✔')} ${msg}`),
  warn: (msg) => console.log(`${c.yellow('!')} ${msg}`),
  error: (msg) => console.error(`${c.red('✖')} ${msg}`),
  hint: (msg) => console.log(`  ${c.dim(msg)}`),
};

export function fail(code, msg, hint) {
  log.error(msg);
  if (hint) log.hint(hint);
  process.exit(code);
}

export function repoRoot() {
  // scripts/design/lib/util.mjs → 저장소 루트
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

export function readJson(file) {
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`JSON 파싱 실패 (${file}): ${err.message}`);
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function nowIso() {
  return new Date().toISOString();
}

export function relPath(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

/* ── 색상 대비 (WCAG 2.1) ─────────────────────────────────────── */

export function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.replace('#', '').trim();
  if (h.length === 3 || h.length === 4) h = h.split('').map((ch) => ch + ch).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function channel(v) {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  if (l1 === null || l2 === null) return null;
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/* ── 텍스트 폭 추정 ────────────────────────────────────────────── */

/**
 * 브라우저 없이 텍스트 렌더 폭을 추정한다. 완벽하지 않지만 "이 제목은 절대 안 들어간다"
 * 수준의 넘침은 잡아낸다. 한글·한자·가나는 전각으로 계산한다.
 */
export function estimateTextWidth(text, fontSizePx, { fontRole = 'body' } = {}) {
  const perEm = fontRole === 'mono' ? 0.6 : 0.52;
  let ems = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60);
    ems += wide ? 1.0 : perEm;
  }
  return ems * fontSizePx;
}

export function rectsOverlap(a, b) {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  return { overlaps: ix > 0 && iy > 0, area: ix * iy };
}
