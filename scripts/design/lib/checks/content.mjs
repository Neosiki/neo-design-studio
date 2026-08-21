/**
 * content.mjs — 내용 자체가 아직 채워지지 않은 것을 잡는다
 *
 * 다른 검사들은 "잘못 만들었다"를 본다. 이 검사는 **"아직 만들지 않았다"**를 본다.
 * 둘은 다른 실패다. 자리표시자가 남은 산출물은 형식이 완벽해도 보낼 수 없는데,
 * 형식만 보는 검사기는 그걸 통과시킨다 — 실제로 그렇게 통과했다.
 *
 * 근거: references/content-guidelines.md 「Don't add filler content」.
 * 그 문서는 채워 넣기용 내용을 넣지 말라고 하고, 자리표시자는 그중에서도 가장
 * 명백한 경우다 — 도구가 직접 써 넣은 것이라 무엇을 찾아야 할지 정확히 안다.
 */

import { loadArtifactIr } from '../project.mjs';
import { iterBlocks } from './structure.mjs';
import { PLACEHOLDERS } from '../scaffold.mjs';

export const id = 'content';
export const title = '내용 · 채움';

/**
 * 채워 넣기용 더미 문장. 언어를 가리지 않고 "아직 쓰지 않았다"는 신호다.
 * 자리표시자 목록과 달리 이쪽은 사람이 어디서 복사해 오는 것들이다.
 */
const FILLER = [
  { re: /lorem\s+ipsum/i, label: 'lorem ipsum' },
  { re: /\bTODO\b|\bFIXME\b|\bTBD\b/, label: 'TODO·FIXME·TBD 표시' },
  { re: /여기에?\s*(내용|텍스트|문구)를?\s*(적|넣|입력)/, label: '"여기에 내용을 넣으세요" 류' },
  { re: /^(테스트|test|asdf|qwer|아무거나|dummy)[\s.!]*$/i, label: '시험용으로 넣은 글자' },
  { re: /^(제목|부제|본문|title|subtitle|body|heading)[\s.]*$/i, label: '종류 이름만 적힌 텍스트' },
  // XX는 낱말 안에 들어 있으면 실제 이름이다(XXPRESS). 홀로 서 있을 때만 빈자리로 본다.
  { re: /(?:^|[^A-Za-z])X{2,}(?![A-Za-z])|○○|□□|\?\?\?\?/, label: '아직 정하지 않은 자리(XX·○○)' },
];

export function run(ctx) {
  const findings = [];

  /* 매니페스트 — 여기 남은 자리표시자는 plan이 IR로 복사해 가므로 근원부터 잡는다 */
  for (const { value, where } of manifestStrings(ctx.manifest)) {
    const hit = PLACEHOLDERS.find((p) => value.includes(p));
    if (hit) {
      findings.push({
        check: 'content.placeholder',
        level: 'warn',
        where,
        message: `init이 넣은 자리표시자가 그대로 있습니다: ${hit}. plan이 이 값을 IR로 복사하므로 렌더 결과에 그대로 나갑니다.`,
      });
    }
  }

  /* IR — 여기 있으면 이미 화면에 나갈 글자다 */
  for (const artRef of ctx.manifest.artifacts || []) {
    const { ir } = loadArtifactIr(ctx, artRef);
    if (!ir) continue;

    for (const { block, where } of iterBlocks(ir)) {
      const at = `${artRef.id} → ${where}`;
      const texts = block.kind === 'bullets' ? block.items || [] : [block.text];
      for (const raw of texts) {
        const text = String(raw || '').trim();
        if (!text) continue;

        const placeholder = PLACEHOLDERS.find((p) => text.includes(p));
        if (placeholder) {
          findings.push({
            check: 'content.placeholder',
            level: 'error',
            where: at,
            message: `자리표시자가 화면에 나갈 자리에 있습니다: ${placeholder}. 이 블록은 렌더되므로 그대로 두면 보는 사람이 읽습니다.`,
          });
          continue;
        }

        const filler = FILLER.find((f) => f.re.test(text));
        if (filler) {
          findings.push({
            check: 'content.filler',
            level: 'error',
            where: at,
            message: `${filler.label}이(가) 남아 있습니다: "${clip(text)}". 실제 내용으로 바꾸거나 블록을 지우세요 (content-guidelines.md 「Don't add filler content」).`,
          });
        }
      }
    }

    /* 자막에도 같은 기준을 적용한다 — 영상 자막은 되돌아가 고치기가 가장 어렵다 */
    for (const scene of ir.scenes || []) {
      if (!scene.subtitle) continue;
      const filler = FILLER.find((f) => f.re.test(String(scene.subtitle).trim()));
      if (filler) {
        findings.push({
          check: 'content.filler',
          level: 'error',
          where: `${artRef.id} → scenes.${scene.id}.subtitle`,
          message: `자막에 ${filler.label}이(가) 남아 있습니다: "${clip(scene.subtitle)}".`,
        });
      }
    }
  }

  return findings;
}

/** 자리표시자가 들어갈 수 있는 매니페스트 자리만 좁혀서 본다. */
function* manifestStrings(manifest) {
  const brief = manifest.brief || {};
  for (const key of ['purpose', 'audience', 'tone']) {
    if (brief[key]) yield { value: String(brief[key]), where: `brief.${key}` };
  }
  for (const c of brief.constraints || []) yield { value: String(c), where: 'brief.constraints' };
  if (manifest.style?.rationale) yield { value: String(manifest.style.rationale), where: 'style.rationale' };
  for (const a of manifest.artifacts || []) {
    if (a.title) yield { value: String(a.title), where: `artifacts[${a.id}].title` };
  }
}

function clip(s) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return [...t].length > 40 ? `${[...t].slice(0, 40).join('')}…` : t;
}
