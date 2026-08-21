/**
 * structure.mjs — 매니페스트·IR 스키마 검증과 참조 무결성
 */

import fs from 'node:fs';
import path from 'node:path';
import { validateManifest, validateArtifactIr, loadArtifactIr } from '../project.mjs';

export const id = 'structure';
export const title = '구조 · 스키마';

export function run(ctx) {
  const findings = [];

  const manifestResult = validateManifest(ctx.manifest);
  for (const err of manifestResult.errors) {
    findings.push({
      check: 'schema.project',
      level: 'error',
      where: `design-project.json${err.path ? ` → ${err.path}` : ''}`,
      message: err.message,
    });
  }

  const assetIds = new Set((ctx.manifest.assets || []).map((a) => a.id));
  const sourceIds = new Set((ctx.manifest.sources || []).map((s) => s.id));
  const seenArtifactIds = new Set();

  for (const ref of ctx.manifest.artifacts || []) {
    if (seenArtifactIds.has(ref.id)) {
      findings.push({
        check: 'schema.artifact.duplicate',
        level: 'error',
        where: `artifacts[${ref.id}]`,
        message: '산출물 id가 중복됩니다',
      });
    }
    seenArtifactIds.add(ref.id);

    const { file, ir } = loadArtifactIr(ctx, ref);
    if (!ir) {
      findings.push({
        check: 'schema.artifact.missing',
        level: 'error',
        where: `artifacts[${ref.id}].ir`,
        message: `IR 파일이 없습니다: ${ref.ir}`,
      });
      continue;
    }

    const irResult = validateArtifactIr(ir);
    for (const err of irResult.errors) {
      findings.push({
        check: 'schema.artifact',
        level: 'error',
        where: `${path.basename(file)}${err.path ? ` → ${err.path}` : ''}`,
        message: err.message,
      });
    }

    if (ir.type !== ref.type) {
      findings.push({
        check: 'schema.artifact.type',
        level: 'error',
        where: `artifacts[${ref.id}]`,
        message: `매니페스트는 type=${ref.type}인데 IR은 type=${ir.type} 입니다`,
      });
    }

    // 블록이 참조하는 에셋·출처가 실제로 등록되어 있는지
    for (const { block, where } of iterBlocks(ir)) {
      if (block.assetId && !assetIds.has(block.assetId)) {
        findings.push({
          check: 'ref.asset',
          level: 'error',
          where: `${ref.id} → ${where}`,
          message: `등록되지 않은 assetId: ${block.assetId}`,
        });
      }
      for (const claim of block.claims || []) {
        if (!sourceIds.has(claim.sourceId)) {
          findings.push({
            check: 'ref.source',
            level: 'error',
            where: `${ref.id} → ${where}`,
            message: `등록되지 않은 sourceId: ${claim.sourceId}`,
          });
        }
      }
    }
  }

  // 폰트가 assets[]를 가리킬 때 존재 확인
  for (const role of ['display', 'body', 'mono']) {
    const spec = ctx.manifest.brand?.tokens?.typography?.[role];
    if (spec?.assetId && !assetIds.has(spec.assetId)) {
      findings.push({
        check: 'ref.font',
        level: 'error',
        where: `brand.tokens.typography.${role}.assetId`,
        message: `등록되지 않은 폰트 자산: ${spec.assetId}`,
      });
    }
  }

  return findings;
}

/** IR 종류와 무관하게 모든 block을 순회한다. */
export function* iterBlocks(ir) {
  for (const page of ir.pages || []) {
    for (const section of page.sections || []) {
      for (const block of section.blocks || []) {
        yield { block, where: `pages.${page.id}.${section.id}.${block.id}`, container: section, page };
      }
    }
  }
  for (const slide of ir.slides || []) {
    for (const block of slide.blocks || []) {
      yield { block, where: `slides.${slide.id}.${block.id}`, container: slide, slide };
    }
  }
  for (const scene of ir.scenes || []) {
    for (const layer of scene.layers || []) {
      if (layer.block) {
        yield { block: layer.block, where: `scenes.${scene.id}.${layer.id}`, container: scene, scene, layer };
      }
    }
  }
}

export function fileExists(ctx, rel) {
  if (!rel) return false;
  return fs.existsSync(path.resolve(ctx.dir, rel));
}
