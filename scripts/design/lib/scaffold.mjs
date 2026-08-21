/**
 * scaffold.mjs — design init / plan이 만드는 매니페스트·IR 골격
 */

import { nowIso } from './util.mjs';

const CANVAS = { deck: { width: 1920, height: 1080 }, video: { width: 1920, height: 1080, fps: 30 }, infographic: { width: 1200, height: 3000 } };

/**
 * init·plan이 채워 넣는 자리표시자 문구.
 *
 * 검사기(checks/content.mjs)가 이 목록을 그대로 가져다 쓴다. 검사기 쪽에 문구를 따로
 * 적어 두면 여기를 고쳤을 때 조용히 갈라지고, 그때부터 검사기는 **자기가 만든 문구를
 * 못 알아본다.** 실제로 그래서 표지 부제에 "(제작 목적을 한 문장으로 적으세요)"가
 * 그대로 렌더돼 나갔고 검수는 통과로 끝났다.
 */
export const PLACEHOLDERS = [
  '(제작 목적을 한 문장으로 적으세요)',
  '(누가 보나요)',
  '(첫 문장)',
];

export function newManifest({ id, name, language = 'ko', deliverables = ['html'], brandName }) {
  const at = nowIso();
  return {
    schemaVersion: '1.0',
    id,
    name,
    createdAt: at,
    updatedAt: at,
    brief: {
      purpose: '(제작 목적을 한 문장으로 적으세요)',
      audience: '(누가 보나요)',
      language,
      aspectRatio: '16:9',
      deliverables,
    },
    brand: {
      name: brandName || name,
      assetProtocol: 'placeholder',
      tokens: {
        color: {
          bg: '#0e1116',
          fg: '#e6edf3',
          muted: '#8b949e',
          surface: '#161b22',
          accent: '#58a6ff',
          accentFg: '#0b1220',
        },
        typography: {
          display: { family: 'Pretendard', weights: [600, 800], fallback: ['Noto Sans KR', 'system-ui', 'sans-serif'] },
          body: { family: 'Pretendard', weights: [400, 500], fallback: ['Noto Sans KR', 'system-ui', 'sans-serif'] },
          scale: [14, 16, 20, 28, 40, 64, 96],
        },
        spacing: { unit: 8 },
        radius: { sm: 6, md: 12, lg: 24 },
        motion: { level: 'subtle', durationMs: { fast: 160, base: 280, slow: 520 } },
      },
    },
    assets: [],
    references: [],
    sources: [],
    productFacts: [],
    approvals: {
      facts: { state: 'pending' },
      assets: { state: 'pending' },
      direction: { state: 'pending' },
      outline: { state: 'pending' },
      draft: { state: 'pending' },
    },
    artifacts: deliverables.map((type) => ({
      id: `${type}-main`,
      type,
      title: `${name} · ${type}`,
      ir: `ir/${type}-main.json`,
      status: 'planned',
      outputs: [],
    })),
    qa: { status: 'never' },
    cache: { inputs: {} },
    history: [],
  };
}

export function newArtifactIr(artifactRef, manifest) {
  const base = {
    schemaVersion: '1.0',
    id: artifactRef.id,
    type: artifactRef.type,
    title: artifactRef.title || artifactRef.id,
  };

  if (artifactRef.type === 'deck') {
    return {
      ...base,
      canvas: { ...CANVAS.deck, safeArea: { top: 60, right: 80, bottom: 80, left: 80 } },
      slides: [
        {
          id: 'cover',
          layout: 'title',
          title: manifest.name,
          blocks: [
            {
              id: 'title',
              kind: 'heading',
              text: manifest.name,
              box: { x: 160, y: 400, w: 1600, h: 160 },
              style: { fontRole: 'display', fontSize: 96, weight: 800, color: 'fg', lineHeight: 1.15 },
            },
            {
              id: 'subtitle',
              kind: 'subheading',
              text: manifest.brief?.purpose || '',
              box: { x: 160, y: 590, w: 1400, h: 80 },
              style: { fontSize: 36, color: 'muted', lineHeight: 1.4 },
            },
          ],
          notes: '(발표자 노트)',
        },
      ],
    };
  }

  if (artifactRef.type === 'video') {
    return {
      ...base,
      canvas: { ...CANVAS.video, safeArea: { top: 60, right: 96, bottom: 120, left: 96 } },
      scenes: [
        {
          id: 'hook',
          sequence: 0,
          startMs: 0,
          durationMs: 3000,
          narrativeRole: 'hook',
          subtitle: '(첫 문장)',
          shot: { camera: 'push-in', transitionIn: 'cut' },
          layers: [
            {
              id: 'title',
              region: { x: 160, y: 440, w: 1600, h: 200 },
              enterMs: 200,
              exitMs: 3000,
              block: {
                id: 'title-text',
                kind: 'heading',
                text: manifest.name,
                style: { fontRole: 'display', fontSize: 110, weight: 800, color: 'fg', align: 'center' },
              },
            },
          ],
        },
      ],
      audio: { targetLufs: -16, silentVariant: true },
    };
  }

  if (artifactRef.type === 'infographic') {
    return {
      ...base,
      canvas: CANVAS.infographic,
      pages: [{ id: 'main', path: 'infographic.html', title: manifest.name, sections: [{ id: 'header', kind: 'hero', blocks: [] }] }],
    };
  }

  return {
    ...base,
    pages: [
      {
        id: 'index',
        path: 'index.html',
        title: manifest.name,
        viewports: ['1440x900', '390x844'],
        sections: [
          {
            id: 'hero',
            kind: 'hero',
            blocks: [
              {
                id: 'hero-title',
                kind: 'heading',
                text: manifest.name,
                style: { fontRole: 'display', fontSize: 64, weight: 800, color: 'fg', lineHeight: 1.15 },
              },
              {
                id: 'hero-sub',
                kind: 'body',
                text: manifest.brief?.purpose || '',
                style: { fontSize: 20, color: 'muted', lineHeight: 1.6 },
              },
            ],
          },
        ],
      },
    ],
  };
}
