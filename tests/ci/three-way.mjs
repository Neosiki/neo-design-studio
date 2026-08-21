#!/usr/bin/env node
/**
 * 삼방향 후보의 온도가 겹치지 않는가.
 *
 * 세 개를 보여 준다는 것만으로는 선택권이 되지 않는다. 셋이 다 조용한 방향이면
 * 사용자는 사실상 하나를 본 것이다. 씨앗과 산출물 종류를 바꿔 가며 18조합을 확인한다.
 */

import { suggestDirections } from '../../scripts/design/lib/styles/registry.mjs';

let checked = 0;
for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
  for (const deliverables of [['html'], ['deck'], ['infographic']]) {
    const r = suggestDirections({ deliverables, seed });
    const temps = new Set(r.candidates.map((c) => c.temperature));
    if (temps.size !== 3) {
      console.error(`::error::seed=${seed} ${deliverables}: 온도 ${[...temps].join(',')} — 겹쳤습니다`);
      process.exit(1);
    }
    checked += 1;
  }
}
console.log(`삼방향 온도 다양성 확인 (${checked}조합)`);
