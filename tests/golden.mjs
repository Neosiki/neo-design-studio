#!/usr/bin/env node
/**
 * tests/golden.mjs — 골든 프레임 회귀 (Playwright 필요, 없으면 건너뜀)
 *
 *   node tests/golden.mjs [--hashes] [--update]
 *
 * tests/run.mjs가 의존성 없이 도는 대신, 이 파일은 브라우저를 띄워 **실제 픽셀**을 본다.
 * 화이트보드에서 눈으로만 확인 가능했던 두 가지를 기계가 보게 만드는 것이 목적이다.
 *
 *   1. 재현성 — 첫 프레임 · 겹침 중간 프레임 · 마지막 프레임이 실행마다 같은가
 *   2. 선노출 — 아직 등장하지 않은 요소의 자리가 정말 비어 있는가
 *
  * 저장된 기준 해시와의 대조는 기본값이 아니다 — --hashes로 명시할 때만 한다.
 * 이 해시는 브라우저 렌더러가 그린 픽셀의 해시라 Chromium 빌드가 바뀌면 값이 갈라진다.
 * CI는 실행마다 최신 Playwright를 새로 받으므로 커밋된 기준값은 처음부터 맞을 수 없었고,
 * 실제로 네 번 연속 실패했다 — 렌더가 틀려서가 아니라 브라우저가 달라서.
 *
 * 지켜야 할 두 가지는 렌더러 버전에 둔감하게 이미 서 있다. seek 결정론은 같은 시각을
 * 두 번 그려 비교하고(아래 a === b), 선노출은 픽셀 색을 직접 찍어 본다.
 * 기준 해시는 한 기계 안에서 지난번과 그림이 달라졌는가를 보는 국소 도구로 남긴다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'whiteboard');
const GOLDEN_FILE = path.join(FIXTURE, 'golden.json');
const UPDATE = process.argv.includes('--update');
/** 저장된 기준 해시와 대조할지. 기본은 하지 않는다 (위 머리말 참고). */
const COMPARE = process.argv.includes('--hashes');

/** 검사 프레임: 첫 · 획 진행 중 · 겹침 구간 · 색 채우기 · 쓸어내기 · 마지막 */
const FRAMES = [
  { name: 'first', t: 0.0, note: '첫 프레임 — 아무것도 그려지지 않음' },
  { name: 'ink-mid', t: 1.6, note: '선을 긋는 중' },
  { name: 'overlap', t: 5.6, note: '겹침 구간 — 두 요소가 동시에 존재' },
  { name: 'color', t: 4.4, note: '색 채우기 단계' },
  { name: 'sweep', t: 9.6, note: 'grid 쓸어내기 중간' },
  { name: 'last', t: 13.9, note: '마지막 프레임' },
];

let playwright;
try {
  playwright = await import('playwright');
} catch {
  console.log('Playwright가 없어 골든 프레임 검사를 건너뜁니다.');
  console.log('  npm install playwright && npx playwright install chromium');
  process.exit(0);
}

/* 컨테이너에 미리 설치된 크로미움이 있으면 그걸 쓴다 (다운로드 회피) */
function chromiumPath() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !fs.existsSync(base)) return undefined;
  for (const dir of fs.readdirSync(base)) {
    for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
      const p = path.join(base, dir, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-golden-'));
copyDir(FIXTURE, tmp, ['out', 'golden.json']);

const cli = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'design', 'cli.mjs'), 'whiteboard', 'preview'], {
  cwd: tmp,
  encoding: 'utf8',
  env: { ...process.env, NO_COLOR: '1' },
});
if (cli.status !== 0) {
  console.error(`preview 실패 (code=${cli.status})\n${cli.stdout}${cli.stderr}`);
  process.exit(1);
}

const pagePath = path.join(tmp, 'out', 'board', 'board.html');
const ir = JSON.parse(fs.readFileSync(path.join(tmp, 'ir', 'board.json'), 'utf8'));

const executablePath = chromiumPath();
const browser = await playwright.chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
await page.goto(pathToFileURL(pagePath).href);
// 준비 완료 계약을 기다린다. 이걸 건너뛰면 첫 프레임에서 글꼴·이미지가 덜 그려져
// 같은 t에서 다른 픽셀이 나온다 (렌더러도 같은 방식으로 기다려야 한다).
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 15000 });

let passed = 0;
const failures = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed += 1; console.log(`  ok   ${name}`); })
    .catch((err) => { failures.push({ name, message: err.message }); console.log(`  FAIL ${name}\n         ${err.message}`); });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function shoot(t) {
  await page.evaluate((tt) => window.seek(tt), t);
  await page.waitForTimeout(90);
  return page.screenshot({ type: 'png' });
}

const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

console.log('\n골든 프레임');

assert(pageErrors.length === 0, `페이지 오류: ${pageErrors.slice(0, 3).join(' / ')}`);

const golden = fs.existsSync(GOLDEN_FILE) ? JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8')) : { frames: {} };
const current = {};

for (const frame of FRAMES) {
  // eslint-disable-next-line no-await-in-loop
  await test(`${frame.name} (${frame.t}s) — ${frame.note}`, async () => {
    const a = hash(await shoot(frame.t));
    // 같은 시각을 다시 그려도 같아야 한다 (시간만으로 상태가 결정되는지)
    await shoot(0);
    const b = hash(await shoot(frame.t));
    assert(a === b, `같은 시각인데 결과가 다름: ${a} vs ${b} — seek이 시간 외의 것에 의존합니다`);
    current[frame.name] = a;

    const expected = golden.frames?.[frame.name];
    if (expected && COMPARE && !UPDATE) {
      assert(expected === a, `골든 해시 불일치: 기대 ${expected}, 실제 ${a}\n         브라우저 버전이 바뀌었다면 스크린샷을 확인한 뒤 --update`);
    }
  });
}

console.log('\n선노출 (픽셀 검사)');

/**
 * 아직 등장하지 않은 요소의 자리가 실제로 비어 있는지 픽셀로 확인한다.
 * 스키마 검사와 달리 이건 "정말 안 보이는가"를 본다.
 */
await test('등장 전 요소의 자리는 종이색 그대로다', async () => {
  const scene = ir.scenes[0];
  const late = scene.layers[1];              // enterMs 5000
  const scale = 960 / ir.canvas.width;
  const png = await shoot(2.0);              // late가 아직 안 나온 시각
  const px = await samplePixels(png, late.region, scale);
  const paper = ir.brand?.paper || '#f7f3ea';
  const nonPaper = px.filter((p) => !nearHex(p, paper, 10));
  assert(
    nonPaper.length === 0,
    `${nonPaper.length}/${px.length} 픽셀이 종이색이 아닙니다 — 등장 전 요소가 새어 나왔습니다 (예: ${JSON.stringify(nonPaper[0])})`
  );
});

await test('보호 영역 밖으로는 앞 요소의 잉크가 넘지 않는다', async () => {
  const scene = ir.scenes[0];
  const prot = scene.layers[0].protectedRegions[0];
  const scale = 960 / ir.canvas.width;
  const png = await shoot(3.4);              // 앞 요소가 선을 다 그은 시각
  const px = await samplePixels(png, prot, scale);
  const nonPaper = px.filter((p) => !nearHex(p, '#f7f3ea', 10));
  assert(nonPaper.length === 0, `보호 영역 안에 잉크 ${nonPaper.length}점 — clipPath가 새고 있습니다`);
});

await test('등장 후에는 실제로 그려진다 (검사가 자명하게 통과하지 않는지 확인)', async () => {
  const scene = ir.scenes[0];
  const late = scene.layers[1];
  const scale = 960 / ir.canvas.width;
  const png = await shoot(6.9);
  const px = await samplePixels(png, late.region, scale);
  const inked = px.filter((p) => !nearHex(p, '#f7f3ea', 10));
  assert(inked.length > 0, '등장 후에도 아무것도 안 그려졌습니다 — 앞의 두 검사가 무의미해집니다');
});

/* ── Studio 미리보기 동등성 ────────────────────────────────────── */

console.log('\nStudio 미리보기 동등성');

/**
 * 편집기가 브라우저에서 만드는 HTML과 CLI가 파일로 쓰는 HTML이 **바이트 단위로 같아야**
 * 한다. 다르면 "화면에서 본 것"과 "파일로 나온 것"이 갈라지고, 편집기를 IR 뒤에 둔
 * 이유가 사라진다.
 */
await test('편집기 미리보기가 CLI 렌더와 바이트 단위로 같다', async () => {
  const studioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-studio-'));
  copyDir(path.join(ROOT, 'examples', 'design-studio-intro'), studioDir, ['out', 'qa.json', 'qa-report.html', '.design']);

  const run = (args) =>
    spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'design', 'cli.mjs'), ...args], {
      cwd: studioDir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' },
    });

  assert(run(['studio']).status === 0, 'studio 생성 실패');
  assert(run(['render']).status === 0, 'render 실패');

  const sp = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const sErrors = [];
  sp.on('pageerror', (e) => sErrors.push(String(e)));
  sp.on('console', (m) => { if (m.type() === 'error') sErrors.push(m.text()); });
  await sp.goto(pathToFileURL(path.join(studioDir, 'out', 'studio.html')).href);
  await sp.waitForTimeout(700);
  assert(sErrors.length === 0, `편집기 오류: ${sErrors.slice(0, 3).join(' / ')}`);

  const ids = await sp.evaluate(() => S.data.artifacts.map((a) => a.id));
  assert(ids.length >= 3, `산출물 ${ids.length}개`);

  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    const fromBrowser = await sp.evaluate((artId) => {
      const files = renderIrFiles(S.data.irs[artId], {
        tokens: S.data.project.tokens,
        lang: S.data.project.lang,
        assetSrc: (a) => S.data.assets[a] || null,
      });
      return files[0].html;
    }, id);

    const outDir = path.join(studioDir, 'out', id);
    const file = fs.readdirSync(outDir).find((f) => f.endsWith('.html'));
    const fromCli = fs.readFileSync(path.join(outDir, file), 'utf8');
    assert(
      fromBrowser === fromCli,
      `${id}: 편집기(${fromBrowser.length}자)와 CLI(${fromCli.length}자)가 다릅니다 — ` +
        `미리보기와 산출물이 갈라집니다.\n         첫 차이 @ ${firstDiff(fromBrowser, fromCli)}`
    );
  }

  await sp.close();
  fs.rmSync(studioDir, { recursive: true, force: true });
});

await test('편집기에서 요소를 고르면 IR의 그 블록이 잡힌다', async () => {
  const studioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-sel-'));
  copyDir(path.join(ROOT, 'examples', 'design-studio-intro'), studioDir, ['out', 'qa.json', 'qa-report.html', '.design']);
  spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'design', 'cli.mjs'), 'studio'], { cwd: studioDir, encoding: 'utf8' });

  const sp = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await sp.goto(pathToFileURL(path.join(studioDir, 'out', 'studio.html')).href);
  await sp.waitForTimeout(700);
  await sp.evaluate(() => document.querySelectorAll('#tabs button')[1].click());
  await sp.waitForTimeout(700);

  const picked = await sp.evaluate(() => {
    const doc = document.getElementById('frame').contentDocument;
    const el = doc.querySelector('.b-heading');
    if (!el) return { error: '제목 요소를 못 찾음' };
    el.click();
    return { sel: S.sel, text: (findBlock(S.sel.container, S.sel.block) || {}).block?.text };
  });
  assert(!picked.error, picked.error);
  assert(picked.sel && picked.sel.block, '선택이 안 됐습니다');
  assert(picked.text && picked.text.length > 0, `IR 블록을 못 찾음: ${JSON.stringify(picked)}`);

  // 편집하면 미리보기가 실제로 바뀌는가
  const changed = await sp.evaluate(() => {
    const found = findBlock(S.sel.container, S.sel.block);
    found.block.text = '편집기가 바꾼 문구';
    rerender();
    return new Promise((r) => setTimeout(() => {
      const doc = document.getElementById('frame').contentDocument;
      r(doc.body.innerHTML.indexOf('편집기가 바꾼 문구') !== -1);
    }, 400));
  });
  assert(changed, '편집했는데 미리보기가 갱신되지 않았습니다');

  await sp.close();
  fs.rmSync(studioDir, { recursive: true, force: true });
});

await browser.close();

if (UPDATE || !fs.existsSync(GOLDEN_FILE)) {
  fs.writeFileSync(
    GOLDEN_FILE,
    `${JSON.stringify({ note: 'design 골든 프레임 해시. node tests/golden.mjs --update 로 갱신.', frames: current }, null, 2)}\n`
  );
  console.log(`\n골든 해시를 저장했습니다: ${path.relative(ROOT, GOLDEN_FILE)}`);
}

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${passed}개 통과 · ${failures.length}개 실패`);
if (failures.length) {
  for (const f of failures) console.log(`✖ ${f.name}\n  ${f.message}`);
  process.exit(1);
}
process.exit(0);

/* ── 보조 ─────────────────────────────────────────────────────── */

/** PNG에서 영역 안 격자점의 RGB를 뽑는다 (외부 이미지 라이브러리 없이 브라우저로) */
async function samplePixels(pngBuffer, region, scale) {
  const b64 = pngBuffer.toString('base64');
  return page.evaluate(
    ([data, r, s]) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const out = [];
          const steps = 9;
          for (let i = 1; i < steps; i += 1) {
            for (let j = 1; j < steps; j += 1) {
              const x = Math.round((r.x + (r.w * i) / steps) * s);
              const y = Math.round((r.y + (r.h * j) / steps) * s);
              if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
              const d = ctx.getImageData(x, y, 1, 1).data;
              out.push([d[0], d[1], d[2]]);
            }
          }
          resolve(out);
        };
        img.src = 'data:image/png;base64,' + data;
      }),
    [b64, region, scale]
  );
}

/** 두 문자열이 처음 갈라지는 자리와 그 주변 */
function firstDiff(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      return `${i}\n         편집기: ${JSON.stringify(a.slice(Math.max(0, i - 50), i + 50))}\n         CLI   : ${JSON.stringify(b.slice(Math.max(0, i - 50), i + 50))}`;
    }
  }
  return '(길이만 다름)';
}

function nearHex([r, g, b], hex, tol) {
  const n = parseInt(hex.replace('#', ''), 16);
  return (
    Math.abs(r - ((n >> 16) & 255)) <= tol && Math.abs(g - ((n >> 8) & 255)) <= tol && Math.abs(b - (n & 255)) <= tol
  );
}

function copyDir(src, dest, skip) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to, skip);
    else fs.copyFileSync(from, to);
  }
}
