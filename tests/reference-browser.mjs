import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sampleFilm } from '../scripts/design/lib/film/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = JSON.parse(fs.readFileSync(path.join(root, 'tests/reference-result.json'), 'utf8')).directory;
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true });
let passed = 0;
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.join(dir, 'comparison/comparison.html')).href);
  assert.ok(await page.locator('img').count());
  assert.ok(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth === 96)));
  await page.screenshot({ path: path.join(dir, 'comparison-preview.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  passed += 1;
  console.log('ok report embeds load and mobile layout stays within the viewport');

  let dialogs = 0;
  page.on('dialog', async dialog => { dialogs += 1; await dialog.dismiss(); });
  await page.goto(pathToFileURL(path.join(dir, 'plan/scenes/shot-001.html')).href);
  await page.evaluate(async () => { await window.film.ready; window.film.frame(0.3); });
  assert.equal(await page.locator('#caption').textContent(), '첫 자막 <script>alert(1)</script>');
  assert.equal(dialogs, 0);
  await page.evaluate(() => window.film.frame(0));
  assert.equal(await page.locator('#caption').textContent(), '');
  await page.evaluate(() => window.film.frame(0.3));
  assert.ok((await page.locator('#caption').textContent()).includes('첫 자막'));
  passed += 1;
  console.log('ok SRT text stays literal and survives backward/forward seeks');
} finally {
  await browser.close();
}
const result = await sampleFilm(path.join(dir, 'plan'), { out: path.join(dir, 'plan-review'), count: 12 });
assert.equal(result.ok, true, JSON.stringify(result.errors));
passed += 1;
console.log('ok generated shot pages pass two shuffled seek orders at twelve times per shot');
console.log(passed + ' passed / 0 failed');
