#!/usr/bin/env node
/**
 * export_deck_pptx.mjs — 여러 파일로 된 slide deck을 편집 가능한 PPTX로 내보낸다
 *
 * 사용법:
 *   node export_deck_pptx.mjs --slides <dir> --out <file.pptx>
 *
 * 동작:
 *   - scripts/html2pptx.js를 호출해 HTML DOM을 요소 단위로 PowerPoint 네이티브 객체로 옮긴다
 *   - 텍스트는 실제 텍스트 박스라서 PPT에서 바로 더블클릭해 고칠 수 있다
 *   - body 크기 960pt × 540pt（LAYOUT_WIDE, 13.333″ × 7.5″）
 *
 * ⚠️ HTML은 4개 하드 제약을 지켜야 한다（references/editable-pptx.md 참고）:
 *   1. 텍스트는 <p>/<h1>-<h6> 안에 넣는다（div에 텍스트를 직접 두지 않는다）
 *   2. CSS 그라디언트를 쓰지 않는다
 *   3. <p>/<h*>에 background/border/shadow를 주지 않는다（바깥 div에 준다）
 *   4. div에 background-image를 쓰지 않는다（<img>를 쓴다）
 *
 * 비주얼 위주로 짠 HTML은 거의 통과하지 못한다 —— HTML 첫 줄부터 제약에 맞춰 써야 한다.
 * 시각적 자유도가 먼저인 경우（애니메이션, web component, CSS 그라디언트, 복잡한 SVG）는
 * export_deck_pdf.mjs / export_deck_stage_pdf.mjs로 PDF를 내보낸다.
 *
 * 의존성: npm install playwright pptxgenjs sharp
 *
 * 파일명 순으로 정렬한다（01-xxx.html → 02-xxx.html → ...）.
 */

import pptxgen from 'pptxgenjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 2) {
    const k = a[i].replace(/^--/, '');
    args[k] = a[i + 1];
  }
  if (!args.slides || !args.out) {
    console.error('사용법: node export_deck_pptx.mjs --slides <dir> --out <file.pptx>');
    console.error('');
    console.error('⚠️ HTML은 4개 하드 제약을 지켜야 한다（references/editable-pptx.md 참고）.');
    console.error('   시각적 자유도가 먼저인 경우에는 export_deck_pdf.mjs로 PDF를 내보내세요.');
    process.exit(1);
  }
  return args;
}

async function main() {
  const { slides, out } = parseArgs();
  const slidesDir = path.resolve(slides);
  const outFile = path.resolve(out);

  const files = (await fs.readdir(slidesDir))
    .filter(f => f.endsWith('.html'))
    .sort();
  if (!files.length) {
    console.error(`No .html files found in ${slidesDir}`);
    process.exit(1);
  }

  console.log(`Converting ${files.length} slides via html2pptx...`);

  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  let html2pptx;
  try {
    html2pptx = require(path.join(__dirname, 'html2pptx.js'));
  } catch (e) {
    console.error(`✗ html2pptx.js 로드 실패: ${e.message}`);
    console.error(`  의존성이 없으면 실행: npm install playwright pptxgenjs sharp`);
    process.exit(1);
  }

  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';  // 13.333 × 7.5 inch, HTML body 960 × 540 pt에 대응

  const errors = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const fullPath = path.join(slidesDir, f);
    try {
      await html2pptx(fullPath, pres);
      console.log(`  [${i + 1}/${files.length}] ${f} ✓`);
    } catch (e) {
      console.error(`  [${i + 1}/${files.length}] ${f} ✗  ${e.message}`);
      errors.push({ file: f, error: e.message });
    }
  }

  if (errors.length) {
    console.error(`\n⚠️ slide ${errors.length}장 변환 실패. 흔한 원인: HTML이 4개 하드 제약을 지키지 않았다.`);
    console.error(`  자세히는 references/editable-pptx.md의 「자주 나는 오류 빠른 확인」.`);
    if (errors.length === files.length) {
      console.error(`✗ 전부 실패해서 PPTX를 만들지 않는다.`);
      process.exit(1);
    }
  }

  await pres.writeFile({ fileName: outFile });
  console.log(`\n✓ Wrote ${outFile}  (${files.length - errors.length}/${files.length} slides, 편집 가능 PPTX)`);
}

main().catch(e => { console.error(e); process.exit(1); });
