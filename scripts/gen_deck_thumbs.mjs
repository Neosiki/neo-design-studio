#!/usr/bin/env node
/**
 * gen_deck_thumbs.mjs — 여러 파일로 된 deck의 각 페이지 썸네일을 만든다（deck_index.html의 「무한 갤러리」 개요용）.
 *
 * 배경: deck_index.html의 개요 모드는 두 가지다——
 *   · 그리드 grid（기본 60%）: iframe으로 실제 하위 페이지를 렌더한다. 선명하고 보이는 그대로이며 썸네일이 필요 없다.
 *   · 무한 갤러리 gallery（40%）: 모든 페이지를 이음매 없이 무한 타일링하고 천천히 흘린다. 수십~수백 장의 타일을
 *     전부 iframe으로 하면 심하게 버벅이므로, 갤러리는 <img> 썸네일을 쓴다——같은 이미지를 여러 번 재사용하면
 *     브라우저가 한 번만 디코드하기 때문에 매끄럽다.
 *   이 스크립트는 갤러리용 썸네일을 준비한다. grid 모드에는 필요 없다.
 *
 * 사용법（deck 프로젝트 루트에 복사하고 의존성을 설치한 뒤 실행）:
 *   npm install playwright sharp
 *   node gen_deck_thumbs.mjs --slides slides --out thumbs [--width 1600] [--quality 86]
 *
 * 그다음 index.html의 MANIFEST 각 항목에 thumb을 추가한다（file과 같은 이름의 .jpg）:
 *   { file: "slides/01-cover.html", thumb: "thumbs/01-cover.jpg", label: "표지" }
 * deck_index.html은 갤러리 모드에서만 thumb을 쓰고, 그리드 모드는 항상 file(iframe)을 쓴다. thumb이 없으면 갤러리는 iframe으로 되돌아간다.
 *
 * 참고: 썸네일 해상도를 너무 낮추지 않는다（기본 1600px）. 낮추면 갤러리에서 카드를 hover로 확대할 때 흐려진다.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const slidesDir = arg('slides', 'slides');
const outDir = arg('out', 'thumbs');
const width = parseInt(arg('width', '1600'), 10);
const quality = parseInt(arg('quality', '86'), 10);
const W = parseInt(arg('canvas-w', '1920'), 10);
const H = parseInt(arg('canvas-h', '1080'), 10);

if (!fs.existsSync(slidesDir)) { console.error('slides 디렉터리를 찾을 수 없다: ' + slidesDir); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const files = fs.readdirSync(slidesDir).filter(f => f.endsWith('.html')).sort();
if (!files.length) { console.error('slides 디렉터리에 .html이 없다'); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
let ok = 0;
for (const f of files) {
  const base = f.replace(/\.html$/, '');
  const out = path.join(outDir, base + '.jpg');
  try {
    await page.goto('file://' + path.resolve(slidesDir, f), { waitUntil: 'load' });
    await page.waitForTimeout(2800);                 // webfont / 이미지 paint 대기
    const buf = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
    await sharp(buf).resize(width).jpeg({ quality }).toFile(out);
    ok++; console.log('[ok] ' + out);
  } catch (e) { console.error('[FAIL] ' + f + ': ' + e.message); }
}
await browser.close();
console.log(`\n=== 썸네일 ${ok}/${files.length}장 → ${outDir}/ ===`);
console.log('index.html의 MANIFEST 각 항목에 thumb 추가: "' + outDir + '/<같은 이름>.jpg"（갤러리 모드에서만 쓰인다）');
