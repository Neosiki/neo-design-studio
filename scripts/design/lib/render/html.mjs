/**
 * render/html.mjs — 렌더 코어를 파일로 떨어뜨리는 얇은 래퍼
 *
 * 렌더 로직 자체는 render/core.mjs에 있다 (브라우저에서도 도는 순수 코드).
 * 여기서는 자산 경로 해석과 파일 쓰기만 한다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { renderIrFiles } from './core.mjs';

export function renderArtifactHtml(ctx, artifactRef, ir, outDir) {
  const assetById = new Map((ctx.manifest.assets || []).map((a) => [a.id, a]));
  const files = renderIrFiles(ir, {
    tokens: ctx.manifest.brand?.tokens,
    lang: ctx.manifest.brief?.language,
    assetSrc: (assetId) => {
      const asset = assetById.get(assetId);
      if (!asset) return null;
      return path.relative(outDir, path.resolve(ctx.dir, asset.path)).split(path.sep).join('/');
    },
  });

  fs.mkdirSync(outDir, { recursive: true });
  return files.map((file) => {
    const abs = path.join(outDir, file.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, file.html, 'utf8');
    return {
      path: path.relative(ctx.dir, abs).split(path.sep).join('/'),
      format: 'html',
      bytes: Buffer.byteLength(file.html),
    };
  });
}
