#!/usr/bin/env node
/**
 * export_deck_stage_pdf.mjs — 단일 파일 <deck-stage> 구조 전용 PDF 내보내기
 *
 * 사용법:
 *   node export_deck_stage_pdf.mjs --html <deck.html> --out <file.pdf> [--width 1920] [--height 1080]
 *
 * 이 스크립트는 언제 쓰나?
 *   - deck이 **단일 HTML 파일**이고, slide가 전부 `<section>`이고, 바깥을 `<deck-stage>`로 감싼 경우
 *   - 이때 `export_deck_pdf.mjs`(다중 파일 전용)는 쓸 수 없다
 *
 * `page.pdf()`를 그냥 쓰면 안 되는 이유(2026-04-20 삽질 기록):
 *   1. deck-stage의 shadow CSS `::slotted(section) { display: none }` 때문에 active slide만 보인다
 *   2. print 미디어에서는 바깥의 `!important`로 shadow DOM 규칙을 누르지 못한다
 *   3. 결과: PDF는 언제나 1페이지(active인 그 한 장)뿐이다
 *
 * 해결책:
 *   HTML을 연 뒤 page.evaluate로 모든 section을 deck-stage slot에서 뽑아내
 *   body 아래의 평범한 div에 붙이고, 인라인 style로 position:relative + 고정 크기를 강제한다.
 *   section마다 page-break-after: always를 주고, 마지막 하나만 auto로 바꿔 꼬리의 빈 페이지를 막는다.
 *
 * 의존성: playwright
 *   npm install playwright
 *
 * 출력 특성:
 *   - 글자는 벡터로 남는다(복사 가능, 검색 가능)
 *   - 시각은 1:1로 재현된다
 *   - 폰트는 Chromium이 불러올 수 있어야 한다(로컬 폰트 또는 Google Fonts)
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

function parseArgs() {
  const args = { width: 1920, height: 1080 };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 2) {
    const k = a[i].replace(/^--/, '');
    args[k] = a[i + 1];
  }
  if (!args.html || !args.out) {
    console.error('사용법: node export_deck_stage_pdf.mjs --html <deck.html> --out <file.pdf> [--width 1920] [--height 1080]');
    process.exit(1);
  }
  args.width = parseInt(args.width);
  args.height = parseInt(args.height);
  return args;
}

async function main() {
  const { html, out, width, height } = parseArgs();
  const htmlAbs = path.resolve(html);
  const outFile = path.resolve(out);

  await fs.access(htmlAbs).catch(() => {
    console.error(`HTML file not found: ${htmlAbs}`);
    process.exit(1);
  });

  console.log(`Rendering ${path.basename(htmlAbs)} → ${path.basename(outFile)}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();

  await page.goto('file://' + htmlAbs, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);  // Google Fonts + deck-stage init 대기

  // 핵심 수정: section을 shadow DOM slot에서 뽑아내 평면으로 펼친다
  const sectionCount = await page.evaluate(({ W, H }) => {
    const stage = document.querySelector('deck-stage');
    if (!stage) throw new Error('<deck-stage> not found — 이 스크립트는 단일 파일 deck-stage 구조에만 쓸 수 있다');
    const sections = Array.from(stage.querySelectorAll(':scope > section'));
    if (!sections.length) throw new Error('No <section> found inside <deck-stage>');

    // 인쇄용 스타일 주입
    const style = document.createElement('style');
    style.textContent = `
      @page { size: ${W}px ${H}px; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff; }
      deck-stage { display: none !important; }
    `;
    document.head.appendChild(style);

    // body 아래로 펼친다
    const container = document.createElement('div');
    container.id = 'print-container';
    sections.forEach(s => {
      // 인라인 style로 최고 우선순위를 확보한다. position:relative를 줘서 absolute 자식 요소가 제대로 잡히게 한다
      s.style.cssText = `
        width: ${W}px !important;
        height: ${H}px !important;
        display: block !important;
        position: relative !important;
        overflow: hidden !important;
        page-break-after: always !important;
        break-after: page !important;
        margin: 0 !important;
        padding: 0 !important;
      `;
      container.appendChild(s);
    });
    // 마지막 페이지는 분리하지 않는다 — 꼬리에 빈 페이지가 생기는 걸 막는다
    const last = sections[sections.length - 1];
    last.style.pageBreakAfter = 'auto';
    last.style.breakAfter = 'auto';
    document.body.appendChild(container);
    return sections.length;
  }, { W: width, H: height });

  await page.waitForTimeout(800);

  await page.pdf({
    path: outFile,
    width: `${width}px`,
    height: `${height}px`,
    printBackground: true,
    preferCSSPageSize: true,
  });

  await browser.close();

  const stat = await fs.stat(outFile);
  const kb = (stat.size / 1024).toFixed(0);
  console.log(`\n✓ Wrote ${outFile}  (${kb} KB, ${sectionCount} pages, vector)`);
  console.log(`  페이지 수 확인: mdimport "${outFile}" && pdfinfo "${outFile}" | grep Pages`);
}

main().catch(e => { console.error(e); process.exit(1); });
