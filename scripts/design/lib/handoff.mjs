/**
 * Portable project handoff, without executing project code or recursively copying its folder.
 * Follows declared Design/Film JSON paths, same-stem media WebVTT sidecars, literal HTML
 * src/href/poster/srcset, CSS url/@import, and relative JS import/export/require/new URL.
 * Relative fetch/DOM URLs in external JS depend on the document and require explicit include.
 * This is a conservative static scanner,
 * not a browser, bundler, template evaluator or dependency installer. Unresolved dynamic paths warn.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { run as securityScan } from './checks/security.mjs';

const META = 'handoff-manifest.json';
const GUIDE = 'HANDOFF_README.md';
const MAX_TEXT = 4 * 1024 * 1024;
const TEXT = /\.(html?|svg|css|[cm]?js|jsx|tsx?|json|md|txt|srt|vtt|sh|ya?ml|scss)$/i;
const STANDARD_SCAN = /\.(html?|svg|json|css|js|mjs|srt|vtt|md|txt|sh)$/i;
const MEDIA_WITH_CAPTIONS = /\.(mp4|m4v|mov|webm|mkv|avi|mpg|mpeg|ogv|mp3|wav|m4a|aac|ogg|oga|flac|aif|aiff|opus)$/i;
const CAPTION_LANGUAGE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const BLOCKED_DIRS = new Set(['.git', '.film', '.design', 'node_modules', '.aws', '.ssh', '.codex', '.claude', '.agents']);
const BLOCKED_FILE = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|credentials(?:[.-].*)?|service-account.*\.json|(?:access[-_]?token|refresh[-_]?token|secrets?)(?:[.-].*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?)$|\.(?:pem|key|p12|pfx|keystore|jks)$/i;
const slash = value => value.split(path.sep).join('/');
const within = (root, target) => {
  const rel = path.relative(root, target);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
};
const blocked = relative => relative.replaceAll('\\', '/').split('/').some(part => BLOCKED_DIRS.has(part.toLowerCase()) || BLOCKED_FILE.test(part));
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function exists(file) {
  try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function fileHash(file) {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = fs.openSync(file, 'r');
  try {
    let read;
    while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read));
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

function safeFile(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') || relative.includes(':')
      || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative)) throw new Error('프로젝트 상대 파일 경로가 필요합니다.');
  const logical = path.resolve(root, ...relative.replaceAll('\\', '/').split('/'));
  if (!within(root, logical)) throw new Error('참조 경로가 프로젝트 밖으로 나갑니다.');
  const rel = slash(path.relative(root, logical));
  if (blocked(rel)) throw new Error('비밀 파일 또는 도구 내부 파일은 납품에 포함할 수 없습니다.');
  const real = fs.realpathSync(logical);
  if (!within(root, real)) throw new Error('심볼릭 링크가 프로젝트 밖을 가리킵니다.');
  if (blocked(slash(path.relative(root, real)))) throw new Error('링크 대상이 비밀 파일 또는 도구 내부 파일입니다.');
  if (!fs.statSync(real).isFile()) throw new Error('파일 참조만 지원합니다. 디렉터리 전체를 복사하지 않습니다.');
  return { rel, real };
}

function htmlEntities(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const hex = /^&#x/i.test(entity);
    const number = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    return Number.isFinite(number) && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
  });
}

// Keep quoted paths for extraction, while excluding comments and code-looking text inside strings.
function jsSource(text) {
  const characters = text.split('');
  const code = new Uint8Array(text.length);
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') characters[i++] = ' ';
      i--; continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      characters[i++] = ' '; characters[i] = ' ';
      while (++i < text.length) {
        if (text[i] === '*' && text[i + 1] === '/') { characters[i] = ' '; characters[++i] = ' '; break; }
        if (text[i] !== '\n') characters[i] = ' ';
      }
      continue;
    }
    code[i] = 1;
  }
  return { text: characters.join(''), code };
}

function analyze(dir, options = {}) {
  const errors = [], warnings = [], records = new Map(), queue = [], processed = new Set(), warningKeys = new Set();
  const fail = (check, message) => errors.push({ check, message });
  const warn = (check, message) => {
    const key = `${check}:${message}`;
    if (!warningKeys.has(key)) { warningKeys.add(key); warnings.push({ check, message }); }
  };
  let root;
  try {
    root = fs.realpathSync(path.resolve(dir));
    if (!fs.statSync(root).isDirectory()) throw new Error('프로젝트 폴더가 아닙니다.');
  } catch { fail('handoff.root', '프로젝트 폴더를 열 수 없습니다.'); return { root, records, report: { ok: false, errors, warnings, files: [] } }; }

  function enqueue(relative, from, role = '', expectedHash) {
    try {
      const item = safeFile(root, relative);
      const key = process.platform === 'win32' ? item.rel.toLowerCase() : item.rel;
      if ([META.toLowerCase(), GUIDE.toLowerCase()].includes(item.rel.toLowerCase())) {
        fail('handoff.reserved', `${from}: 납품 메타데이터용 파일명과 충돌합니다.`); return;
      }
      const firstReference = !records.has(key);
      if (firstReference) records.set(key, { ...item, sha256: null, bytes: null, roles: new Set(), hashes: [] });
      const record = records.get(key);
      if (expectedHash) record.hashes.push(expectedHash);
      if (!record.roles.has(role)) { record.roles.add(role); queue.push({ record, role }); }
      if (firstReference && MEDIA_WITH_CAPTIONS.test(item.rel)) {
        // OpenFilm discovers same-name WebVTT companions without an HTML href.
        // Compare the complete stem, not a filename prefix (voice.mp4 must not collect voice-extra.vtt).
        const directory = path.dirname(path.join(root, item.rel));
        const extension = path.extname(item.rel);
        const stem = path.basename(item.rel, extension);
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          if (!entry.name.startsWith(`${stem}.`) || !entry.name.endsWith('.vtt')) continue;
          const language = entry.name.slice(stem.length + 1, -4);
          if (entry.name !== `${stem}.vtt` && !CAPTION_LANGUAGE.test(language)) continue;
          const companion = slash(path.relative(root, path.join(directory, entry.name)));
          enqueue(companion, `${item.rel} WebVTT sidecar`);
        }
      }
    } catch (error) {
      const check = /프로젝트 밖/.test(error.message) ? 'handoff.path' : /비밀|내부 파일/.test(error.message) ? 'handoff.excluded' : 'handoff.missing';
      fail(check, `${from}: 필요한 로컬 파일을 안전하게 포함할 수 없습니다. ${error.code === 'ENOENT' ? '파일이 없습니다.' : error.message}`);
    }
  }

  function reference(value, from, { rootRelative = false, module = false, expectedHash } = {}) {
    if (typeof value !== 'string') { fail('handoff.reference', `${from}: 파일 경로는 문자열이어야 합니다.`); return; }
    const raw = htmlEntities(value).trim();
    if (!raw || raw.startsWith('#')) return;
    if (/(?:\$\{|\{\{|<%)/.test(raw)) { warn('handoff.dynamic', `${from}: 동적으로 구성되는 경로를 확인하고 --include로 필요한 파일을 추가하세요.`); return; }
    if (/^[a-z]:[\\/]|^\\\\|^file:/i.test(raw)) { fail('handoff.path', `${from}: 절대 파일 경로는 납품에 포함할 수 없습니다.`); return; }
    if (/^(?:data|blob|mailto|tel|javascript):/i.test(raw)) return;
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(raw)) {
      let origin = '외부 주소';
      try { origin = new URL(raw.startsWith('//') ? `https:${raw}` : raw).origin; } catch { /* no unsafe URL text in reports */ }
      warn('handoff.external', `${from}: 외부 참조(${origin})는 다운로드하거나 포장하지 않습니다.`); return;
    }
    if (module && !raw.startsWith('.') && !raw.startsWith('/')) { warn('handoff.package', `${from}: bare package import는 설치/번들링하지 않습니다. 필요한 런타임 의존성을 별도로 확인하세요.`); return; }
    let decoded;
    try { decoded = decodeURIComponent(raw.split(/[?#]/, 1)[0]).replaceAll('\\', '/'); }
    catch { fail('handoff.path', `${from}: 잘못 인코딩된 파일 경로입니다.`); return; }
    if (!decoded) return;
    if (decoded.includes('\0') || decoded.includes(':') || /^\/\//.test(decoded)) { fail('handoff.path', `${from}: 허용하지 않는 파일 경로입니다.`); return; }
    if (rootRelative && decoded.startsWith('/')) { fail('handoff.path', `${from}: 매니페스트 파일 경로는 프로젝트 기준 상대 경로여야 합니다.`); return; }
    const base = rootRelative || decoded.startsWith('/') ? root : path.dirname(path.join(root, from));
    let candidate = path.resolve(base, decoded.replace(/^\/+/, ''));
    if (!within(root, candidate)) { fail('handoff.path', `${from}: 참조 경로가 프로젝트 밖으로 나갑니다.`); return; }
    if (module && !exists(candidate) && !path.extname(candidate)) {
      const alternatives = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '/index.js', '/index.ts'].map(suffix => `${candidate}${suffix}`);
      const found = alternatives.filter(file => exists(file));
      if (found.length === 1) { candidate = found[0]; warn('handoff.resolution', `${from}: 확장자를 생략한 모듈을 파일 하나로 추정했습니다. 원래 빌드 도구에서 다시 확인하세요.`); }
      else { fail('handoff.module', `${from}: 확장자를 생략한 모듈을 확정할 수 없습니다.`); return; }
    }
    enqueue(slash(path.relative(root, candidate)), from, '', expectedHash);
  }

  function scanCss(text, from) {
    const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) reference(match[1] ?? match[2] ?? match[3], from);
    for (const match of css.matchAll(/@import\s+(["'])(.*?)\1/gi)) reference(match[2], from);
  }

  function scanJs(text, from, { inlineDocument = false } = {}) {
    const source = jsSource(text);
    text = source.text;
    const matches = pattern => [...text.matchAll(pattern)].filter(match => source.code[match.index]);
    const documentReference = value => {
      if (inlineDocument || /^(?:\/|#|[a-z][a-z\d+.-]*:)/i.test(value.trim())) reference(value, from);
      else warn('handoff.documentRelative', `${from}: 외부 JS의 fetch/DOM 상대 주소는 문서 위치에 따라 달라집니다. 실제 파일을 --include로 명시하세요.`);
    };
    const imports = /\b(?:import|export)\s+(?:[^;\n'"`]*?\s+from\s*)?(["'])([^'"\r\n]+)\1/g;
    for (const match of matches(imports)) reference(match[2], from, { module: true });
    for (const match of matches(/\b(import|require|fetch)\s*\(\s*(["'])([^'"\r\n]+)\2\s*(?:,|\))/g)) {
      if (match[1] === 'fetch') documentReference(match[3]);
      else reference(match[3], from, { module: true });
    }
    for (const match of matches(/\bnew\s+URL\s*\(\s*(["'])([^'"\r\n]+)\1\s*,\s*import\.meta\.url\s*\)/g)) reference(match[2], from);
    for (const match of matches(/\.(?:src|href|poster)\s*=\s*(["'])([^'"\r\n]+)\1/g)) documentReference(match[2]);
    if (matches(/\b(?:import|require|fetch)\s*\(\s*(?!\s*["'])[^\s)]|\bnew\s+URL\s*\(\s*(?!\s*["'])[^\s)]|\.(?:src|href|poster)\s*=\s*(?!\s*["'])[^\s]|\b(?:innerHTML|srcdoc)\s*=/gm).length) {
      warn('handoff.dynamic', `${from}: 동적 import/fetch/DOM 경로는 정적으로 확정할 수 없습니다. --include로 파일을 명시하세요.`);
    }
  }

  function scanHtml(text, from) {
    const clean = text.replace(/<!--[\s\S]*?-->/g, '');
    for (const tag of clean.matchAll(/<([a-z][\w:-]*)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi)) {
      if (tag[1].toLowerCase() === 'base') warn('handoff.base', `${from}: base href에 따른 주소 변경은 해석하지 않습니다. 납품 폴더에서 링크를 직접 확인하세요.`);
      for (const attribute of tag[2].matchAll(/\b(src|href|poster|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
        const value = attribute[2] ?? attribute[3] ?? attribute[4];
        if (attribute[1].toLowerCase() === 'srcset') {
          if (/^\s*data:/i.test(value)) { warn('handoff.srcset', `${from}: data URL을 포함한 srcset은 개별 후보를 해석하지 않습니다.`); continue; }
          for (const part of value.split(',')) reference(part.trim().split(/\s+/)[0], from);
        } else if (tag[1].toLowerCase() !== 'base') reference(value, from);
      }
      for (const style of tag[2].matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) scanCss(style[1] ?? style[2], from);
    }
    for (const match of clean.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) scanCss(match[1], from);
    for (const match of clean.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) scanJs(match[1], from, { inlineDocument: true });
    if (/\bsrcdoc\s*=|(?:\{\{|<%)/.test(clean)) warn('handoff.dynamic', `${from}: srcdoc 또는 템플릿 경로는 완전히 해석하지 않습니다. 필요한 파일을 명시하세요.`);
  }

  function scanJson(text, from, role) {
    let data;
    try { data = JSON.parse(text); } catch { fail('handoff.json', `${from}: JSON을 읽을 수 없습니다.`); return; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) { fail('handoff.json', `${from}: 프로젝트/IR JSON은 객체여야 합니다.`); return; }
    const add = (value, expectedHash) => reference(value, from, { rootRelative: true, expectedHash });
    const each = (items, label, fn) => {
      if (items === undefined) return;
      if (!Array.isArray(items)) { fail('handoff.json', `${from}: ${label}은 배열이어야 합니다.`); return; }
      for (const item of items) if (item && typeof item === 'object') fn(item); else fail('handoff.json', `${from}: ${label}의 항목은 객체여야 합니다.`);
    };
    if (role === 'design') {
      each(data.assets, 'assets', item => { if (item.path) add(item.path, item.sha256); else fail('handoff.reference', `${from}: 자산 파일 경로가 없습니다.`); });
      for (const collection of ['references', 'sources']) each(data[collection], collection, item => { if (item.path) add(item.path); });
      each(data.style?.candidates, 'style.candidates', item => { if (item.preview) add(item.preview); });
      for (const gate of Object.values(data.approvals || {})) {
        if (gate?.evidence !== undefined && !Array.isArray(gate.evidence)) fail('handoff.json', `${from}: 승인 evidence는 배열이어야 합니다.`);
        else for (const evidence of gate?.evidence || []) add(evidence);
      }
      each(data.artifacts, 'artifacts', item => {
        if (item.ir) {
          add(item.ir);
          const absolute = path.resolve(root, String(item.ir).replaceAll('\\', '/'));
          if (within(root, absolute)) enqueue(slash(path.relative(root, absolute)), from, 'ir');
        }
        each(item.outputs, 'outputs', output => { if (output.path) add(output.path, output.sha256); });
      });
    } else if (role === 'film') {
      each(data.shots, 'shots', item => { if (item.page) add(item.page); });
      each(data.assets, 'assets', item => { if (item.path) add(item.path, item.sha256); });
    } else if (role === 'ir') {
      const walk = value => {
        if (Array.isArray(value)) { value.forEach(walk); return; }
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          if (['path', 'src', 'srt'].includes(key) && typeof child === 'string') add(child);
          else walk(child);
        }
      };
      walk(data);
    }
  }

  const entries = [];
  for (const [relative, role] of [['design-project.json', 'design'], ['film.html', ''], ['film-plan.json', 'film']]) {
    if (exists(path.join(root, relative))) { enqueue(relative, relative, role); if (relative !== 'film-plan.json') entries.push(relative); }
  }
  if (!entries.length) fail('handoff.entry', 'design-project.json 또는 film.html이 있는 프로젝트 폴더가 필요합니다.');
  if (options.include !== undefined && (!Array.isArray(options.include) || options.include.some(value => typeof value !== 'string'))) fail('handoff.include', 'include는 프로젝트 상대 파일 경로의 배열이어야 합니다.');
  else for (const relative of options.include || []) enqueue(relative, 'include');

  const extraScan = {};
  while (queue.length) {
    const { record, role } = queue.shift();
    const key = `${record.rel}\0${role}`;
    if (processed.has(key)) continue;
    processed.add(key);
    try {
      const current = safeFile(root, record.rel);
      const stat = fs.statSync(current.real);
      const isText = TEXT.test(record.rel);
      const bytes = isText && stat.size <= MAX_TEXT ? fs.readFileSync(current.real) : null;
      const currentHash = bytes ? digest(bytes) : fileHash(current.real);
      if (record.sha256 && record.sha256 !== currentHash) { fail('handoff.changed', `${record.rel}: 검사 중 파일이 변경됐습니다. 다시 검사하세요.`); continue; }
      record.sha256 = currentHash; record.bytes = stat.size;
      if (isText && !bytes) { warn('handoff.scan.limit', `${record.rel}: 4 MiB를 넘어 내용/의존 경로/키 검사를 생략했습니다. 별도로 검토하세요.`); continue; }
      if (!bytes) continue;
      const text = bytes.toString('utf8');
      if (!STANDARD_SCAN.test(record.rel)) extraScan[record.rel] = text;
      if (/\.(html?|svg)$/i.test(record.rel)) scanHtml(text, record.rel);
      else if (/\.(css|scss)$/i.test(record.rel)) scanCss(text, record.rel);
      else if (/\.(?:[cm]?js|jsx|tsx?)$/i.test(record.rel)) scanJs(text, record.rel);
      else if (role) scanJson(text, record.rel, role);
    } catch { fail('handoff.read', `${record.rel}: 검사할 파일을 읽을 수 없거나 경로가 변경됐습니다.`); }
  }
  const files = [...records.values()].map(item => item.rel).sort();
  for (const record of records.values()) {
    for (const expected of record.hashes) if (expected !== record.sha256) fail('handoff.hash', `${record.rel}: 매니페스트 SHA-256과 실제 파일이 다릅니다.`);
  }
  try {
    const scan = securityScan({ dir: root, manifest: { assets: files.map((relative, i) => ({ id: `file-${i}`, path: relative })), artifacts: [{ id: 'handoff', outputs: files.map(relative => ({ path: relative })) }], handoffSources: extraScan } });
    for (const item of scan) (item.level === 'error' ? fail : warn)(item.check, `${item.where}: ${item.message}`);
  } catch { fail('handoff.security', '파일 유출 검사를 완료하지 못했습니다.'); }
  return { root, records, entries, report: { ok: errors.length === 0, errors, warnings, files } };
}

export function checkHandoff(dir, options = {}) { return analyze(dir, options).report; }

/** The output must be a new folder outside the source, including through parent symlinks. */
export function packHandoff(dir, out, options = {}) {
  const analysis = analyze(dir, options);
  const target = typeof out === 'string' && out ? path.resolve(out) : null;
  const failure = (check, message) => ({ ok: false, out: target, files: [], errors: [...analysis.report.errors, { check, message }], warnings: analysis.report.warnings });
  if (!analysis.report.ok) return { ...analysis.report, ok: false, out: target, files: [] };
  if (!target) return failure('handoff.output', '새 납품 폴더 경로가 필요합니다.');
  try {
    if (exists(target)) return failure('handoff.output.exists', '이미 존재하는 납품 경로를 덮어쓰지 않습니다.');
    if (within(analysis.root, target)) return failure('handoff.output.inside', '프로젝트 안에는 납품 폴더를 만들지 않습니다.');
    let parent = path.dirname(target);
    while (!exists(parent)) parent = path.dirname(parent);
    if (within(analysis.root, fs.realpathSync(parent))) return failure('handoff.output.inside', '납품 폴더의 상위 링크가 원본 프로젝트를 가리킵니다.');
  } catch { return failure('handoff.output', '납품 경로를 안전하게 확인할 수 없습니다.'); }
  let createdReal;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Exclusive creation: never reuse even an empty destination supplied by someone else.
    fs.mkdirSync(target);
    createdReal = fs.realpathSync(target);
    if (within(analysis.root, createdReal)) throw new Error('납품 경로가 원본 프로젝트 안으로 변경됐습니다.');
    const inventory = [];
    for (const record of [...analysis.records.values()].sort((a, b) => a.rel.localeCompare(b.rel))) {
      const source = safeFile(analysis.root, record.rel);
      const destination = path.join(createdReal, ...record.rel.split('/'));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source.real, destination, fs.constants.COPYFILE_EXCL);
      const actual = fileHash(destination);
      if (actual !== record.sha256) throw new Error(`${record.rel}: 검사 뒤 파일이 변경됐습니다. 원본에서 다시 포장하세요.`);
      inventory.push({ path: record.rel, sha256: actual, bytes: fs.statSync(destination).size });
    }
    const guide = `# NeoDesign 프로젝트 재개 안내\n\n이 폴더는 원본을 수정하지 않고 명시적 로컬 참조만 모은 납품본입니다. 프로그램 실행·렌더·모델 호출·의존성 설치는 수행하지 않았습니다.\n\n- 진입 파일: ${analysis.entries.join(', ')}\n- Design 프로젝트: 호환되는 NeoDesign 설치의 CLI로 이 폴더에서 resume/check를 실행합니다. 도구와 node_modules는 포함하지 않습니다.\n- Film 프로젝트: 별도 설치된 OpenFilm에서 이 폴더를 열어 전체 합성·오디오·자막과 렌더를 확인합니다. 샷 HTML을 더블클릭한 결과만으로 전체 영화 검수를 대신하지 않습니다.\n- handoff-manifest.json의 상대 경로·크기·SHA-256으로 파일을 확인할 수 있습니다.\n\n## 포함 범위와 한계\n\n매니페스트/IR의 자산·출력·원본 출처·잠근 레퍼런스·초안/승인 증거, HTML의 src/href/poster/srcset, CSS url/@import, JS의 명시적 상대 import/export/require와 new URL(..., import.meta.url)을 추적했습니다. 미디어와 같은 이름의 .vtt 및 .ko.vtt/.en-US.vtt 같은 언어 자막도 포함합니다. 프로젝트 경계 안의 상대 경로만 포함합니다.\n\nHTML 인라인 JS의 literal fetch/DOM 주소는 그 문서 기준으로 추적하지만, 외부 JS의 문서 상대 fetch/DOM 주소는 호출 문서에 따라 달라져 추정하지 않습니다. 실제 파일을 --include로 명시하세요. 임의 코드 실행, 템플릿 평가, import map/bundler/동적 경로 해석은 하지 않습니다.\n\n외부 URL·bare package·동적 경로와 4 MiB 초과 텍스트는 완전성을 보장하지 않습니다. 다음 경고를 확인하고 실제 실행 환경에서 링크·글꼴·재생을 검토하세요.\n\n${analysis.report.warnings.length ? analysis.report.warnings.map(item => `- ${item.check}: ${item.message}`).join('\n') : '- 정적 검사 경고 없음. 시각·오디오·배포 권리 검토는 별도입니다.'}\n\n.git/.film/.design/node_modules, 에이전트 설정·키·credentials 파일은 포장하지 않습니다. 비밀 파일이 필수 참조이면 포장을 중단합니다.\n`;
    fs.writeFileSync(path.join(createdReal, GUIDE), guide, { flag: 'wx' });
    inventory.push({ path: GUIDE, sha256: digest(Buffer.from(guide)), bytes: Buffer.byteLength(guide) });
    const manifest = { schemaVersion: '1.0', kind: 'neodesign-project-handoff', createdAt: new Date().toISOString(), entries: analysis.entries, files: inventory.sort((a, b) => a.path.localeCompare(b.path)), warnings: analysis.report.warnings };
    fs.writeFileSync(path.join(createdReal, META), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    return { ok: true, out: target, files: [...analysis.report.files, GUIDE, META].sort(), warnings: analysis.report.warnings };
  } catch (error) {
    // Remove only the exact new directory made by this call, never a pre-existing or replaced path.
    if (createdReal && exists(target) && fs.realpathSync(target) === createdReal && !within(analysis.root, createdReal)) fs.rmSync(target, { recursive: true, force: true });
    return failure('handoff.pack', `납품 폴더를 완성하지 못했습니다. ${error.message}`);
  }
}

export function handoffCommand(args) {
  const action = args.positional[0] || 'help';
  if (action === 'help') {
    console.log('design handoff check|pack --dir <프로젝트> [--out <새납품폴더>] [--include <파일1,파일2>] [--strict]\n명시적인 로컬 참조만 추적합니다. 동적 경로/외부 주소는 경고하며, 코드 실행·모델 호출·의존성 설치를 하지 않습니다.'); return 0;
  }
  if (!['check', 'pack'].includes(action) || args.flags.dir === true || (args.flags.include !== undefined && typeof args.flags.include !== 'string') || (action === 'pack' && (typeof args.flags.out !== 'string' || !args.flags.out))) { console.error('handoff check 또는 pack과 --dir, pack에는 --out <새납품폴더>를 지정하세요. --include에는 파일 경로가 필요합니다.'); return 1; }
  const options = { include: typeof args.flags.include === 'string' ? args.flags.include.split(',').map(value => value.trim()).filter(Boolean) : [] };
  const dir = args.flags.dir || '.';
  const check = checkHandoff(dir, options);
  if (action === 'check' || !check.ok || (args.flags.strict && check.warnings.length)) {
    console.log(JSON.stringify(check, null, 2)); return !check.ok || (args.flags.strict && check.warnings.length) ? 4 : 0;
  }
  const result = packHandoff(dir, args.flags.out, options);
  console.log(JSON.stringify(result, null, 2)); return result.ok ? 0 : 4;
}
