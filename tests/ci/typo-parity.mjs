#!/usr/bin/env node
/**
 * 렌더러와 검사기가 같은 조판 기준을 쓰는가.
 *
 * 기준값이 두 곳으로 갈라지면 "검수는 통과했는데 화면은 틀린" 상태가 만들어진다.
 * 그건 검사가 아예 없는 것보다 나쁘다 — 사람이 통과를 믿기 때문이다.
 * 그래서 렌더 결과의 실제 CSS를 읽어 검사기가 기대하는 값과 대조한다.
 */

import { renderIrFiles } from '../../scripts/design/lib/render/core.mjs';
import { defaultLineHeight, bodyBaseline } from '../../scripts/design/lib/render/shared.mjs';

const fail = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};

const ir = {
  schemaVersion: '1.0',
  id: 'd',
  type: 'deck',
  title: 'd',
  canvas: { width: 1920, height: 1080 },
  slides: [
    {
      id: 's1',
      layout: 'statement',
      blocks: [
        { id: 'big', kind: 'heading', text: '큰 제목', box: { x: 0, y: 0, w: 1400, h: 200 }, style: { fontSize: 96 } },
        { id: 'small', kind: 'body', text: '본문', box: { x: 0, y: 400, w: 1000, h: 200 }, style: { fontSize: 24 } },
      ],
    },
  ],
};

const ko = renderIrFiles(ir, { tokens: {}, lang: 'ko', assetSrc: () => null })[0].html;
const en = renderIrFiles(ir, { tokens: {}, lang: 'en', assetSrc: () => null })[0].html;
const base = bodyBaseline('deck');

for (const [kind, size] of [['heading', 96], ['body', 24]]) {
  const want = defaultLineHeight(kind, size, true, base);
  if (!ko.includes(`line-height:${want}`)) fail(`${kind} ${size}px 행간 ${want}가 렌더 결과에 없습니다`);
}

// typography.md 4.5 — 한글은 대자에서도 -0.02em이 한계다
if (/letter-spacing:-0\.0[3-9]/.test(ko)) fail('한글에 -0.03em 이하 자간이 나갔습니다 (typography.md 4.5)');

for (const decl of ['font-synthesis: none', 'prefers-reduced-motion']) {
  if (!ko.includes(decl)) fail(`${decl} 선언이 없습니다`);
}
if (!ko.includes('line-break: strict')) fail('한글 금칙 처리 선언이 없습니다');
if (en.includes('line-break: strict')) fail('서문 산출물에 한글 금칙 처리가 붙었습니다');

console.log('조판 기준 일치 · 합성 금지 · 금칙 처리 · 움직임 축소 확인');
