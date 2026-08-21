#!/usr/bin/env node
/**
 * HTML animation → MP4 via deterministic frame-by-frame SEEK (Playwright + ffmpeg).
 *
 * 이것은 render-video.js（Playwright recordVideo）의 프레임별 대체 렌더러입니다. 기술적 핵심은 차용했습니다
 * HeyGen HyperFrames（Apache 2.0）의 '시계 동결 + seek로 타임스탬프로 이동해 스크린샷' 아이디어를 참고하지만,
 * 어떤 타사 패키지도 도입하지 않습니다——이 스킬에 이미 포함된 playwright + ffmpeg만 사용하며, 런타임 중립적입니다.
 *
 * render-video.js에서 풀기 어려웠던 세 가지 문제를 해결합니다(참조 references/video-export.md §「seek 렌더링」):
 *   1. 프레임률이 Chromium headless compositor에 의해 25fps로 고정되지 않습니다 —— --fps로 네이티브 임의 프레임률
 *   2. 더 이상 convert-formats.sh의 minterpolate로 사후 보간할 필요가 없습니다（ghosting + macOS
 *      QuickTime 호환 버그，자세한 내용은 animation-pitfalls §14 참조）—— 각 프레임은 실제로 seek한 화면입니다
 *   3. 스크린 녹화를 하지 않음 → 시작 블랙 프레임 없음 → --trim / --fontwait / __ready 오프셋 로직 불필요
 *   추가: 타임스탬프로 seek하여 캡처하면 입력과 출력이 같을 때 결정적입니다（recordVideo는 실시간 녹화로 비결정적）
 *
 * 전제: 애니메이션은 Stage 시계를 사용해야 합니다（assets/animations.jsx의 <Stage> 또는 narration_stage.jsx
 * 의 <NarrationStage>），이들은 window.__seekRender에 반응하여 자체 구동 시계를 동결하고, 그리고 노출
 * window.__seek(t)。순수 CSS @keyframes / Lottie / 비 Stage 구동 애니메이션은 __seek를 받지 않습니다，
 * 이런 경우는 계속 render-video.js를 사용하세요。
 *
 * Requires: global playwright (`npm install -g playwright`), ffmpeg on PATH.
 *
 * Usage:
 *   NODE_PATH=$(npm root -g) node render-video-seek.js <html-file> \
 *     [--duration=30] [--fps=60] [--width=1920] [--height=1080] \
 *     [--concurrency=4] [--settle=2] [--keep-chrome]
 *
 * Output: next to the HTML file, same basename with .mp4 suffix.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

function arg(name, def) {
  const p = process.argv.find(a => a.startsWith('--' + name + '='));
  return p ? p.slice(name.length + 3) : def;
}
function hasFlag(name) {
  return process.argv.includes('--' + name);
}

const HTML_FILE = process.argv[2];
if (!HTML_FILE || HTML_FILE.startsWith('--')) {
  console.error('Usage: node render-video-seek.js <html-file>');
  console.error('Example: NODE_PATH=$(npm root -g) node render-video-seek.js my-animation.html --fps=60');
  process.exit(1);
}

const DURATION    = parseFloat(arg('duration', '30'));
const FPS         = parseFloat(arg('fps', '60'));      // 네이티브로 임의 프레임률, 기본 실제 60fps
const WIDTH       = parseInt(arg('width', '1920'));
const HEIGHT      = parseInt(arg('height', '1080'));
const CONCURRENCY = Math.max(1, parseInt(arg('concurrency', '4')));  // 병렬 워커 수（각각 하나의 page）
const SETTLE      = Math.max(1, parseInt(arg('settle', '2')));        // seek 후 몇 번의 rAF를 기다린 뒤 스크린샷
const READY_TIMEOUT = parseFloat(arg('readytimeout', '8'));
const KEEP_CHROME = hasFlag('keep-chrome');

const HTML_ABS = path.resolve(HTML_FILE);
const BASENAME = path.basename(HTML_FILE, path.extname(HTML_FILE));
const DIR      = path.dirname(HTML_ABS);
const TMP_DIR  = path.join(DIR, '.seek-tmp-' + Date.now() + '-' + process.pid);
const MP4_OUT  = path.join(DIR, BASENAME + '.mp4');

// render-video.js와 완전히 동일한 chrome 숨김 규칙（두 경로의 결과물 외관을 일치시키기 위해）」
const HIDE_CHROME_CSS = `
  .no-record,
  .progress, .progress-bar,
  .counter, .tCur,
  .phases, .phase-label, .phase,
  .replay, button.replay,
  .masthead, .kicker, .title,
  .footer,
  [data-role="chrome"], [data-record="hidden"] {
    display: none !important;
  }
`;

const TOTAL_FRAMES = Math.round(FPS * DURATION);

console.log(`▸ Seek-rendering: ${HTML_FILE}`);
console.log(`  size: ${WIDTH}x${HEIGHT} · ${FPS}fps · duration: ${DURATION}s · frames: ${TOTAL_FRAMES} · workers: ${CONCURRENCY}`);
console.log(`  output: ${MP4_OUT}`);

// 페이지 컨텍스트에서 실행: SETTLE개의 rAF를 기다림（React/Babel 커밋 + 레이아웃 안정 후 스크린샷）
async function waitRaf(page, n) {
  await page.evaluate((count) => new Promise(resolve => {
    let i = 0;
    const step = () => { i++; (i >= count) ? resolve() : requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), n);
}

// 하나의 worker：페이지 하나를 열고, goto, __seek 준비될 때까지 대기하며, 할당된 프레임을 렌더링
async function renderFrames(context, url, frames) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });

  // Stage / NarrationStage는 __seekRender 모드에서 window.__seek를 노출하고 자체 구동 시계를 동결합니다
  await page.waitForFunction(
    () => window.__ready === true && typeof window.__seek === 'function',
    { timeout: READY_TIMEOUT * 1000 },
  );

  for (const f of frames) {
    const t = f / FPS;
    await page.evaluate((tt) => window.__seek(tt), t);
    await waitRaf(page, SETTLE);
    await page.screenshot({
      path: path.join(TMP_DIR, 'frame-' + String(f).padStart(6, '0') + '.png'),
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    });
  }
  await page.close();
}

(async () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const browser = await chromium.launch();
  const url = 'file://' + HTML_ABS;

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });

  // 핵심 신호：__seekRender는 Stage / NarrationStage가 wall-clock rAF를 동결하고 외부 __seek로 프레임을 밀어넣게 합니다
  // __recording은 그대로 사용하여 Stage가 loop=false를 강제합니다（기존 약속 재사용）
  await context.addInitScript(() => {
    window.__recording = true;
    window.__seekRender = true;
  });

  if (!KEEP_CHROME) {
    // render-video.js와 동일한 chrome 숨김（CSS + 고정 바 휴리스틱）
    await context.addInitScript(css => {
      const HIDE_MARK = 'data-video-hidden';
      function injectStyle() {
        const style = document.createElement('style');
        style.setAttribute('data-inject', 'render-video-chrome-hide');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
      }
      function hideChromeBars() {
        const vh = window.innerHeight;
        document.querySelectorAll('div, nav, header, footer, section, aside')
          .forEach(el => {
            if (el.hasAttribute(HIDE_MARK)) return;
            if (el.dataset.recordKeep === 'true') return;
            const s = getComputedStyle(el);
            if (s.position !== 'fixed' && s.position !== 'sticky') return;
            const r = el.getBoundingClientRect();
            if (r.height > vh * 0.25) return;
            const atBottom = r.bottom >= vh - 30;
            const atTop = r.top <= 30 && r.height < 80;
            if (!atBottom && !atTop) return;
            const txt = el.textContent || '';
            const hasBtn = !!el.querySelector('button, [role="button"]');
            const hasCtrls = /[⏸▶⏮⏭↻↺↩↪]|\d+\.\d+\s*s/.test(txt);
            if (hasBtn || hasCtrls) {
              el.style.setProperty('display', 'none', 'important');
              el.setAttribute(HIDE_MARK, '1');
            }
          });
      }
      const start = () => {
        injectStyle();
        hideChromeBars();
        const obs = new MutationObserver(hideChromeBars);
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => obs.disconnect(), 6000);
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
      } else {
        start();
      }
    }, HIDE_CHROME_CSS);
  }

  // 프레임을 round-robin으로 CONCURRENCY개의 worker에 분배（각 page는 독립 window, seek이 서로 간섭하지 않음）
  const buckets = Array.from({ length: CONCURRENCY }, () => []);
  for (let f = 0; f < TOTAL_FRAMES; f++) buckets[f % CONCURRENCY].push(f);

  console.log(`▸ Capturing ${TOTAL_FRAMES} frames across ${CONCURRENCY} workers…`);
  try {
    await Promise.all(buckets.map(b => b.length ? renderFrames(context, url, b) : Promise.resolve()));
  } catch (e) {
    const msg = String(e && e.message || e);
    if (/__seek|__ready/.test(msg)) {
      console.error('');
      console.error('✗ 애니메이션이 window.__seek를 노출하지 않거나 준비되지 않았습니다。');
      console.error('  seek 렌더링은 Stage 시계를 사용하는 애니메이션(assets/animations.jsx의 <Stage>');
      console.error('  또는 narration_stage.jsx의 <NarrationStage>）。순수 CSS @keyframes / Lottie /');
      console.error('  수작업으로 작성한 non-Stage 애니메이션은 render-video.js를 사용하세요。');
      console.error('');
    }
    await browser.close();
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    console.error(msg.slice(0, 500));
    process.exit(1);
  }

  await browser.close();

  const pngCount = fs.readdirSync(TMP_DIR).filter(f => f.endsWith('.png')).length;
  if (pngCount === 0) {
    console.error('✗ 어떤 프레임도 캡처되지 않았습니다');
    process.exit(1);
  }
  console.log(`▸ Captured ${pngCount}/${TOTAL_FRAMES} frames. Encoding H.264…`);

  // PNG 시퀀스 → MP4。트림 없음（원래 블랙 프레임 없음），입출력 프레임률을 모두 FPS로 설정。
  const ffmpeg = spawnSync('ffmpeg', [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(TMP_DIR, 'frame-%06d.png'),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '18',
    '-preset', 'medium',
    '-r', String(FPS),
    '-movflags', '+faststart',
    MP4_OUT,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  if (ffmpeg.status !== 0) {
    console.error('✗ ffmpeg failed:\n' + ffmpeg.stderr.toString().slice(-2000));
    process.exit(1);
  }

  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  const mp4Size = (fs.statSync(MP4_OUT).size / 1024 / 1024).toFixed(1);
  console.log(`✓ Done: ${MP4_OUT} (${mp4Size} MB · ${FPS}fps native)`);
})();
