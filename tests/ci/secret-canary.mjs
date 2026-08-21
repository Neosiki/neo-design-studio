#!/usr/bin/env node
/**
 * 유출 검사가 살아 있는가.
 *
 * "예제가 통과한다"만 보면 검사가 통째로 죽어도 초록불이 켜진다. 그래서 두 방향을
 * 함께 본다 — 멀쩡한 예제에 아무 말도 하지 않는지, 그리고 **일부러 심은 키를 잡는지.**
 *
 * 심는 값은 AWS 문서에 실린 공개 예시 키다. 형태는 진짜와 같고 아무 권한도 없다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as security from '../../scripts/design/lib/checks/security.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANARY = 'AKIAIOSFODNN7EXAMPLE';
const fail = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};

const dir = path.join(ROOT, 'examples', 'design-studio-intro');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'design-project.json'), 'utf8'));

const clean = security.run({ dir, manifest });
if (clean.length) fail(`예제에서 유출 판정: ${clean.map((f) => `${f.check} @ ${f.where}`).join(' · ')}`);

manifest.brief.constraints = [...(manifest.brief.constraints || []), CANARY];
const caught = security.run({ dir, manifest }).filter((f) => f.check === 'secret.key');
if (caught.length !== 1) fail(`심어 둔 키를 잡지 못했습니다 (${caught.length}건) — 검사가 죽어 있습니다`);
if (caught[0].message.includes(CANARY)) fail('보고서가 값을 그대로 다시 적었습니다 — 보고서가 두 번째 유출이 됩니다');
if (!caught[0].message.includes('…')) fail('가려진 흔적이 없습니다');

console.log('유출 검사 살아 있음 · 예제 깨끗함 · 값은 가려짐');
