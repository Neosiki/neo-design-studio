import fs from 'node:fs';
import path from 'node:path';
import { sha256File } from './util.mjs';
export function artifactFreshness(ctx, artifactRef, inputsDirty = false) {
  const reasons = [];
  if (inputsDirty) reasons.push('입력 파일이 변경됨');
  const outputs = artifactRef.outputs || [];
  if (!outputs.length) reasons.push('기록된 산출물이 없음');
  for (const out of outputs) {
    const abs = path.resolve(ctx.dir, out.path);
    if (!fs.existsSync(abs)) { reasons.push(`산출물 없음: ${out.path}`); continue; }
    if (!out.sha256) { reasons.push(`해시 없음: ${out.path}`); continue; }
    if (sha256File(abs) !== out.sha256) reasons.push(`산출물 변경됨: ${out.path}`);
  }
  return { fresh: reasons.length === 0, stale: reasons.length > 0, reasons };
}
export function staleArtifacts(ctx, inputsDirty = false) { return (ctx.manifest.artifacts || []).map((a) => ({ id: a.id, ...artifactFreshness(ctx, a, inputsDirty) })).filter((a) => a.stale); }
