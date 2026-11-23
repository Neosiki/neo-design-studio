/** Webtoon studio regressions: starters, lint, art sizes, art-init --link, prompts; browser render only when Chromium is available. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STARTERS, check, buildPrompts, artSize } from '../skills/webtoon-studio/scripts/webtoon-studio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'skills', 'webtoon-studio', 'scripts', 'webtoon-studio.mjs');
const node = process.execPath;

function cli(args, cwd) {
  const p = spawnSync(node, [SCRIPT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  return { code: p.status, out: `${p.stdout}${p.stderr}` };
}

export function run(test, assert) {
  test('웹툰 시작 spec: 모든 종류가 오류 없이 검사를 통과한다', () => {
    for (const kind of Object.keys(STARTERS)) {
      const r = check(STARTERS[kind]());
      assert(r.errors.length === 0, `${kind}: ${r.errors.join(' / ')}`);
    }
  });

  test('웹툰 검사: 없는 캐릭터와 출처 없는 후기 말풍선을 오류로 잡는다', () => {
    const spec = STARTERS['four-cut']();
    spec.panels[0].characters = ['없는인물'];
    spec.panels[1].bubbles = [{ type: 'review', text: '맛있어요', x: 0.1, y: 0.1, w: 0.5 }];
    const r = check(spec);
    assert(r.errors.some((e) => e.includes('없는인물')), `캐릭터 오류 없음: ${r.errors.join(' / ')}`);
    assert(r.errors.some((e) => /source|출처/.test(e)), `출처 오류 없음: ${r.errors.join(' / ')}`);
  });

  test('웹툰 art 크기: 4:5 격자는 980×1070, 스크롤은 폭의 1.5배', () => {
    const grid = STARTERS['store-menu']();
    assert(grid.format === '4x5', `store-menu 형식 ${grid.format}`);
    const g = artSize(grid, grid.panels[0]);
    assert(g.w === 980 && g.h === 1070, `격자 ${g.w}x${g.h}`);
    const ep = STARTERS.episode();
    const s = artSize(ep, { ratio: 1 });
    assert(s.w === Math.round(ep.width * 1.5) && s.h === s.w, `스크롤 ${s.w}x${s.h}`);
  });

  test('웹툰 프롬프트: 컷마다 A안·B안이 나온다', () => {
    const md = buildPrompts(STARTERS['four-cut']());
    assert((md.match(/A안/g) || []).length >= 4 && (md.match(/B안/g) || []).length >= 4, 'A안/B안 수가 부족함');
  });

  test('웹툰 art-init --link: 뼈대 SVG를 만들고 spec에 연결하며 검사가 통과한다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webtoon-'));
    try {
      assert(cli(['init', '--kind', 'store-menu', '--out', 'spec.json'], dir).code === 0, 'init 실패');
      const r = cli(['art-init', '--spec', 'spec.json', '--out-dir', 'art', '--link'], dir);
      assert(r.code === 0, r.out);
      const svg = fs.readFileSync(path.join(dir, 'art', 'c1.svg'), 'utf8');
      assert(/<svg[\s>]/.test(svg) && /viewBox="0 0 980 1070"/.test(svg), 'viewBox가 art 크기와 다름');
      const spec = JSON.parse(fs.readFileSync(path.join(dir, 'spec.json'), 'utf8'));
      assert(spec.panels.every((p) => p.art === `art/${p.id}.svg`), `art 연결 ${JSON.stringify(spec.panels.map((p) => p.art))}`);
      const c = cli(['check', '--spec', 'spec.json'], dir);
      assert(c.code === 0 && /오류 0/.test(c.out), c.out);
      assert(!/자리표시/.test(c.out), `자리표시 경고가 남음: ${c.out}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('웹툰 art-init: 이미 있는 SVG는 덮어쓰지 않는다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webtoon-'));
    try {
      cli(['init', '--kind', 'four-cut', '--out', 'spec.json'], dir);
      cli(['art-init', '--spec', 'spec.json', '--out-dir', 'art'], dir);
      const f = path.join(dir, 'art', 'c1.svg');
      fs.writeFileSync(f, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');
      const r = cli(['art-init', '--spec', 'spec.json', '--out-dir', 'art'], dir);
      assert(/건너뜀/.test(r.out) && fs.readFileSync(f, 'utf8').includes('0 0 10 10'), '기존 SVG를 덮어씀');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('웹툰 합성(Chromium이 있을 때만): art 컷을 렌더해 4:5 이미지를 만든다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webtoon-'));
    try {
      cli(['init', '--kind', 'store-menu', '--out', 'spec.json'], dir);
      cli(['art-init', '--spec', 'spec.json', '--out-dir', 'art', '--link'], dir);
      const r = cli(['compose', '--spec', 'spec.json', '--out-dir', 'out'], dir);
      if (r.code !== 0 && /Playwright|Executable doesn't exist|browserType/i.test(r.out)) return; // 브라우저가 없는 환경은 건너뜀
      assert(r.code === 0, r.out);
      const png = fs.readFileSync(path.join(dir, 'out', 'fourcut-4x5.png'));
      assert(png.readUInt32BE(16) === 1080 && png.readUInt32BE(20) === 1350, `크기 ${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}
