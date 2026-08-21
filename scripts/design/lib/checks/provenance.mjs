/**
 * provenance.mjs — 자산 출처, 레퍼런스 잠금, 주장·수치의 출처 연결
 *
 * 배경: slides_maker의 출처 추적과 Refero의 레퍼런스 잠금을 실행 가능한 게이트로 옮긴 것.
 * "예쁘게 나왔지만 어디서 온 숫자인지 모른다"를 기계적으로 막는다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { sha256File } from '../util.mjs';
import { loadArtifactIr } from '../project.mjs';
import { getStyle, findSimilar } from '../styles/registry.mjs';
import { iterBlocks } from './structure.mjs';

export const id = 'provenance';
export const title = '출처 · 자산';

/** 본문에서 출처가 필요한 수치를 찾는 휴리스틱: 퍼센트, 배수, 통화, 4자리 이상 수 */
const NUMERIC_CLAIM = /(\d[\d,.]*\s?%|\d[\d,.]*\s?(배|x|×)\b|[$₩¥€]\s?\d|\b\d{4,}\b|\d[\d,.]*\s?(억|만|천만|조)\b)/;

export function run(ctx) {
  const findings = [];
  const assets = ctx.manifest.assets || [];

  for (const asset of assets) {
    const abs = path.resolve(ctx.dir, asset.path);
    const where = `assets[${asset.id}]`;

    // 파일이 없어도 출처·라이선스 검사는 계속한다. 한 문제가 다른 문제를 가리면 안 된다.
    const exists = fs.existsSync(abs);
    if (!exists) {
      findings.push({ check: 'asset.missing', level: 'error', where, message: `파일이 없습니다: ${asset.path}` });
    } else {
      const actual = sha256File(abs);
      if (!asset.sha256) {
        findings.push({
          check: 'asset.hash',
          level: 'warn',
          where,
          message: `sha256이 기록되지 않았습니다. design build가 채워 넣습니다 (실제값 ${actual.slice(0, 12)}…)`,
        });
      } else if (asset.sha256 !== actual) {
        findings.push({
          check: 'asset.hash',
          level: 'error',
          where,
          message: '파일이 기록된 해시와 다릅니다. 자산이 교체됐다면 출처를 다시 확인하세요.',
        });
      }
    }

    if (asset.provenance?.origin === 'unknown') {
      findings.push({
        check: 'asset.origin',
        level: 'error',
        where,
        message: '출처가 unknown입니다. 브랜드 자산 협의(references/brand-asset-protocol.md)를 먼저 통과하세요.',
      });
    }
    if (['official', 'stock'].includes(asset.provenance?.origin) && !asset.provenance?.url) {
      findings.push({
        check: 'asset.origin.url',
        level: 'warn',
        where,
        message: '공식·스톡 자산인데 출처 URL이 없습니다.',
      });
    }
    if (!asset.license || (!asset.license.spdx && !asset.license.name)) {
      findings.push({
        check: 'asset.license',
        level: 'warn',
        where,
        message: '라이선스가 비어 있습니다. 재배포 가능 여부를 확인하세요.',
      });
    } else if (asset.license.redistributable === false) {
      findings.push({
        check: 'asset.license.redistribution',
        level: 'warn',
        where,
        message: '재배포 불가 자산입니다. 산출물 배포 범위를 확인하세요.',
      });
    }
    if (['image', 'logo', 'screenshot', 'icon'].includes(asset.kind) && !asset.alt) {
      findings.push({ check: 'a11y.alt', level: 'warn', where, message: '대체 텍스트(alt)가 없습니다.' });
    }
  }

  // 레퍼런스 잠금
  const refs = ctx.manifest.references || [];
  const directionApproved = ['approved', 'waived'].includes(ctx.manifest.approvals?.direction?.state);
  if (directionApproved && refs.length === 0) {
    findings.push({
      check: 'reference.empty',
      level: 'warn',
      where: 'references',
      message: '방향이 승인됐는데 레퍼런스가 하나도 잠기지 않았습니다. 선택 근거를 남기세요.',
    });
  }
  for (const ref of refs) {
    if (!ref.locked && directionApproved) {
      findings.push({
        check: 'reference.unlocked',
        level: 'warn',
        where: `references[${ref.id}]`,
        message: '방향 승인 이후에도 잠기지 않은 레퍼런스입니다.',
      });
    }
    if (ref.supersedes && !ref.supersedeReason) {
      findings.push({
        check: 'reference.supersede',
        level: 'error',
        where: `references[${ref.id}]`,
        message: `${ref.supersedes}를 교체했는데 사유(supersedeReason)가 없습니다.`,
      });
    }
  }

  // 스타일 선택 근거 (삼방향 하드 게이트의 기계적 증거)
  const style = ctx.manifest.style;
  if (directionApproved) {
    if (!style) {
      findings.push({
        check: 'style.missing',
        level: 'error',
        where: 'style',
        message: '방향이 승인됐는데 선택한 스타일이 기록되지 않았습니다.',
      });
    } else {
      const candidates = style.candidates || [];
      if (candidates.length < 3 && ctx.manifest.approvals.direction.state !== 'waived') {
        findings.push({
          check: 'style.candidates',
          level: 'error',
          where: 'style.candidates',
          message: `삼방향 게이트: 초안 3개 이상을 기록해야 합니다 (현재 ${candidates.length}개).`,
        });
      }
      if (candidates.length > 0 && !candidates.some((cand) => cand.chosen)) {
        findings.push({
          check: 'style.chosen',
          level: 'error',
          where: 'style.candidates',
          message: '사용자가 고른 방향(chosen: true)이 표시되지 않았습니다.',
        });
      }
      // 레지스트리와 대조한다.
      //
      // 레지스트리에 없다는 것 자체는 문제가 아니다 — 스타일 문서가 직접 말한다:
      // "이건 없을 때 대체하는 탄약이지, 반드시 여기서 골라야 하는 목록이 아니다."
      // 사용자 브랜드에서 자란 방향이 오히려 정상이다. 그래서 **오타로 보일 때만** 경고한다.
      try {
        const known = getStyle(style.id);
        if (!known) {
          const near = findSimilar(style.id).map((s) => s.id);
          if (near.length) {
            findings.push({
              check: 'style.unknown',
              level: 'warn',
              where: 'style.id',
              message: `레지스트리에 '${style.id}'가 없습니다. 오타라면: ${near.join(', ')}. 직접 정의한 방향이면 그대로 두세요.`,
            });
          }
        } else if (known.fidelity < 70) {
          findings.push({
            check: 'style.fidelity',
            level: 'warn',
            where: `style.id`,
            message: `${known.name}의 HTML 재현도는 ${known.fidelity}%입니다. 어느 부분을 단색으로 낮췄는지 산출물에 밝히세요.`,
          });
        }
      } catch {
        /* 레지스트리가 없는 배포본에서는 건너뛴다 */
      }

      for (const cand of candidates) {
        if (cand.preview && !fs.existsSync(path.resolve(ctx.dir, cand.preview))) {
          findings.push({
            check: 'style.preview',
            level: 'warn',
            where: `style.candidates[${cand.id}]`,
            message: `초안 파일이 없습니다: ${cand.preview}`,
          });
        }
      }
    }
  }

  // 사실 검증 (핵심 원칙 #0)
  for (const fact of ctx.manifest.productFacts || []) {
    if (fact.confidence === 'unresolved') {
      findings.push({
        check: 'facts.unresolved',
        level: 'error',
        where: 'productFacts',
        message: `확인되지 않은 단언이 남아 있습니다: "${fact.claim}". 사용자에게 물어보세요.`,
      });
    }
  }

  // 주장·수치의 출처 연결
  for (const artRef of ctx.manifest.artifacts || []) {
    const { ir } = loadArtifactIr(ctx, artRef);
    if (!ir) continue;
    for (const { block, where } of iterBlocks(ir)) {
      const texts = [block.text, ...(block.items || [])].filter(Boolean);
      const hasClaims = (block.claims || []).length > 0;
      const numericText = texts.find((t) => NUMERIC_CLAIM.test(t));
      if (numericText && !hasClaims) {
        findings.push({
          check: 'source.unlinked',
          level: 'warn',
          where: `${artRef.id} → ${where}`,
          message: `수치가 있는데 출처가 연결되지 않았습니다: "${truncate(numericText)}"`,
        });
      }
    }
  }

  // 인용문이 실제 출처 텍스트에 존재하는지
  const sourceById = new Map((ctx.manifest.sources || []).map((s) => [s.id, s]));
  for (const artRef of ctx.manifest.artifacts || []) {
    const { ir } = loadArtifactIr(ctx, artRef);
    if (!ir) continue;
    for (const { block, where } of iterBlocks(ir)) {
      for (const claim of block.claims || []) {
        if (claim.kind !== 'quote') continue;
        const src = sourceById.get(claim.sourceId);
        if (!src) continue;
        const quotes = (src.quotes || []).map((q) => q.text);
        if (quotes.length > 0 && !quotes.some((q) => q.includes(claim.text) || claim.text.includes(q))) {
          findings.push({
            check: 'source.quote',
            level: 'error',
            where: `${artRef.id} → ${where}`,
            message: `인용문이 출처 ${claim.sourceId}의 기록된 문장과 일치하지 않습니다.`,
          });
        }
      }
    }
  }

  return findings;
}

function truncate(s, n = 48) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
