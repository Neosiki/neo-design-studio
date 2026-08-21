#!/usr/bin/env node
/**
 * export_deck_pdf.mjs — 여러 파일로 나뉜 slide deck을 벡터 PDF 하나로 내보낸다
 *
 * 사용법:
 *   node export_deck_pdf.mjs --slides <dir> --out <file.pdf> [--width 1920] [--height 1080]
 *
 * 특징:
 *   - 글자가 벡터로 남는다(복사·검색 가능)
 *   - 배경/도형 1:1 재현(Playwright에 내장된 Chromium이 렌더한다)
 *   - HTML을 고칠 필요가 전혀 없다
 *   - 시각 손실 = 0(PDF가 곧 브라우저 인쇄 결과다)
 *
 * trade-off:
 *   - PDF에서는 글자를 더 편집할 수 없다(고치려면 HTML로 돌아간다)
 *
 * 의존: playwright pdf-lib
 *   npm install playwright pdf-lib
 *
 * 파일명 순으로 정렬한다(01-xxx.html → 02-xxx.html → ...)
 */

import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';

function parseArgs() {
  const args = { width: 1920, height: 1080 };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 2) {
    const k = a[i].replace(/^--/, '');
    args[k] = a[i + 1];
  }
  if (!args.slides || !args.out) {
    console.error('사용법: node export_deck_pdf.mjs --slides <dir> --out <file.pdf> [--width 1920] [--height 1080]');
    process.exit(1);
  }
  args.width = parseInt(args.width);
  args.height = parseInt(args.height);
  return args;
}

async function main() {
  const { slides, out, width, height } = parseArgs();
  const slidesDir = path.resolve(slides);
  const outFile = path.resolve(out);

  const files = (await fs.readdir(slidesDir))
    .filter(f => f.endsWith('.html'))
    .sort();
  if (!files.length) {
    console.error(`No .html files found in ${slidesDir}`);
    process.exit(1);
  }
  console.log(`Found ${files.length} slides in ${slidesDir}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height } });

  // 1) Render each HTML to its own PDF buffer
  const pageBuffers = [];
  for (const f of files) {
    const page = await ctx.newPage();
    const url = 'file://' + path.join(slidesDir, f);
    await page.goto(url, { waitUntil: 'networkidle' }).catch(() => page.goto(url));
    await page.waitForTimeout(1200);  // web-font paint
    // emulate "screen" so CSS colors/backgrounds render the same as browser
    await page.emulateMedia({ media: 'screen' });
    const buf = await page.pdf({
      width: `${width}px`,
      height: `${height}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: false,
    });
    pageBuffers.push(buf);
    await page.close();
    console.log(`  [${pageBuffers.length}/${files.length}] ${f}`);
  }

  await browser.close();

  // 2) Merge into a single PDF
  const merged = await PDFDocument.create();
  for (const buf of pageBuffers) {
    const src = await PDFDocument.load(buf);
    const copied = await merged.copyPages(src, src.getPageIndices());
    copied.forEach(p => merged.addPage(p));
  }
  const bytes = await merged.save();
  await fs.writeFile(outFile, bytes);

  const kb = (bytes.byteLength / 1024).toFixed(0);
  console.log(`\n✓ Wrote ${outFile}  (${kb} KB, ${files.length} pages, vector)`);
}

main().catch(e => { console.error(e); process.exit(1); });
