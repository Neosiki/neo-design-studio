/**
 * tests/whiteboard.mjs — whiteboard 플러그인 회귀 (의존성 없음)
 *
 * tests/run.mjs가 불러 쓴다. 브라우저가 필요한 골든 프레임 검사는 tests/golden.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSrt, detectLanguage, endsSentence, startsNewTopic, formatSrt } from '../scripts/design/lib/srt.mjs';
import { planSceneBoundaries, planWhiteboardIr, layoutRegions } from '../scripts/design/lib/whiteboard/plan.mjs';
import { auditMask, deriveProtectedRegions, buildAllowedPath, sweepRect, intersect } from '../scripts/design/lib/reveal-mask.mjs';
import { buildMixPlan } from '../scripts/design/lib/whiteboard/audio.mjs';
import { wrapText, renderWhiteboardLayer } from '../scripts/design/lib/render/whiteboard.mjs';
import { validate } from '../scripts/design/lib/schema.mjs';
import { validateArtifactIr } from '../scripts/design/lib/project.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'whiteboard');

const SRT_KO = `1
00:00:00,000 --> 00:00:04,000
설계 문서를 아무리 잘 써도 사람은 그걸 다 읽지 않습니다.

2
00:00:04,200 --> 00:00:09,000
그래서 규칙을 검사로 옮겼습니다.

3
00:00:09,200 --> 00:00:14,000
하지만 여기서 문제가 하나 남습니다.
`;

export function run(test, assert) {
  /* ── SRT 파서 ── */

  test('UTF-8 BOM을 벗겨낸다', () => {
    const { cues } = parseSrt(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(SRT_KO, 'utf8')]));
    assert(cues.length === 3, `큐 ${cues.length}개`);
    assert(!cues[0].text.startsWith('﻿'), 'BOM이 본문에 남았습니다');
  });

  test('UTF-16 LE BOM을 읽는다', () => {
    const { cues } = parseSrt(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(SRT_KO, 'utf16le')]));
    assert(cues.length === 3, `큐 ${cues.length}개`);
    assert(cues[0].text.includes('설계 문서'), `본문: ${cues[0].text}`);
  });

  test('CRLF와 마침표 타임코드를 받는다', () => {
    const { cues } = parseSrt('1\r\n00:00:01.5 --> 00:00:03.250\r\nhello\r\n');
    assert(cues.length === 1, `큐 ${cues.length}개`);
    assert(cues[0].startMs === 1500, `시작 ${cues[0].startMs}`);
    assert(cues[0].endMs === 3250, `끝 ${cues[0].endMs}`);
  });

  test('인덱스 번호가 없어도 읽는다', () => {
    const { cues } = parseSrt('00:00:00,000 --> 00:00:02,000\n첫 줄\n\n00:00:02,000 --> 00:00:04,000\n둘째 줄');
    assert(cues.length === 2, `큐 ${cues.length}개`);
  });

  test('여러 줄 자막을 한 문장으로 합친다', () => {
    const { cues } = parseSrt('1\n00:00:00,000 --> 00:00:02,000\n앞줄\n뒷줄');
    assert(cues[0].lines.length === 2, '줄 정보가 보존되지 않음');
    assert(cues[0].text === '앞줄 뒷줄', `text=${cues[0].text}`);
  });

  test('끝이 시작보다 빠른 큐를 버리고 경고한다', () => {
    const { cues, warnings } = parseSrt('1\n00:00:05,000 --> 00:00:02,000\n거꾸로');
    assert(cues.length === 0, '잘못된 큐를 받아들였습니다');
    assert(warnings.length > 0, '경고가 없습니다');
  });

  test('타임코드 없는 블록을 건너뛰고 계속 읽는다', () => {
    const { cues, warnings } = parseSrt('쓰레기 블록\n\n1\n00:00:00,000 --> 00:00:02,000\n정상');
    assert(cues.length === 1, `큐 ${cues.length}개`);
    assert(warnings.some((w) => w.includes('타임코드')), '경고 문구 없음');
  });

  test('SRT를 다시 써도 왕복이 성립한다', () => {
    const { cues } = parseSrt(SRT_KO);
    const again = parseSrt(formatSrt(cues)).cues;
    assert(again.length === cues.length, '큐 수가 달라짐');
    assert(again[2].startMs === cues[2].startMs && again[2].text === cues[2].text, '내용이 달라짐');
  });

  /* ── 언어와 문장 경계 ── */

  test('한국어·중국어·일본어·영어를 구분한다', () => {
    const cue = (t) => [{ text: t }];
    assert(detectLanguage(cue('설계 문서를 읽지 않습니다')) === 'ko', '한국어 오판');
    assert(detectLanguage(cue('\u8BBE\u8BA1\u6587\u6863\u6CA1\u6709\u4EBA\u4F1A\u5168\u90E8\u8BFB\u5B8C')) === 'zh', '중국어 오판');
    assert(detectLanguage(cue('문서는 읽히지 않습니다')) === 'ko', '한국어 오판');
    assert(detectLanguage(cue('Nobody reads the whole spec')) === 'en', '영어 오판');
  });

  test('언어별 문장 종결을 판정한다', () => {
    assert(endsSentence('읽지 않습니다', 'ko'), '한국어 종결 미검출');
    assert(endsSentence('그렇게 했다', 'ko'), '한국어 -다 미검출');
    assert(!endsSentence('그리고 우리는', 'ko'), '미완성 문장을 종결로 봄');
    assert(endsSentence('Nobody reads it.', 'en'), '영어 종결 미검출');
    assert(endsSentence('\u6CA1\u6709\u4EBA\u4F1A\u8BFB\u3002', 'zh'), '중국어 종결 미검출');
  });

  test('전환어로 시작하는 자막을 알아본다', () => {
    assert(startsNewTopic('하지만 여기서 문제가', 'ko'), '한국어 전환어 미검출');
    assert(startsNewTopic('However, there is a catch', 'en'), '영어 전환어 미검출');
    assert(!startsNewTopic('그 다음 이야기는', 'ko'), '전환어가 아닌 것을 전환어로 봄');
  });

  /* ── 장면 계획 ── */

  test('장면 경계를 문장 끝에서 고른다', () => {
    const { cues } = parseSrt(SRT_KO);
    const groups = planSceneBoundaries(cues, { targetMs: 5000, minMs: 3000, maxMs: 8000, lang: 'ko' });
    assert(groups.length >= 2, `장면 ${groups.length}개`);
    // 첫 경계는 문장이 끝난 자막 뒤여야 한다
    const last = groups[0].cues[groups[0].cues.length - 1];
    assert(endsSentence(last.text, 'ko'), `문장 중간에서 잘림: "${last.text}"`);
  });

  test('전환어 앞에서 끊는 쪽을 선호한다', () => {
    const { cues } = parseSrt(SRT_KO);
    const groups = planSceneBoundaries(cues, { targetMs: 6000, minMs: 3000, maxMs: 10000, lang: 'ko' });
    const boundaryTexts = groups.slice(1).map((g) => g.cues[0].text);
    assert(
      boundaryTexts.some((t) => startsNewTopic(t, 'ko')),
      `전환어에서 시작하는 장면이 없음: ${JSON.stringify(boundaryTexts)}`
    );
  });

  test('모든 자막이 정확히 한 장면에 들어간다', () => {
    const { cues } = parseSrt(SRT_KO);
    const groups = planSceneBoundaries(cues, { targetMs: 4000, minMs: 2000, maxMs: 6000, lang: 'ko' });
    const total = groups.reduce((n, g) => n + g.cues.length, 0);
    assert(total === cues.length, `자막 ${cues.length}개인데 장면에는 ${total}개`);
  });

  test('계획 결과가 영상 IR 스키마를 통과한다', () => {
    const { ir } = planWhiteboardIr(SRT_KO, { id: 'wb', targetMs: 5000, minMs: 3000, maxMs: 8000 });
    const r = validateArtifactIr(ir);
    assert(r.valid, `스키마 위반: ${JSON.stringify(r.errors.slice(0, 3))}`);
  });

  test('계획 결과의 whiteboard 주석이 스키마를 통과한다', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'whiteboard-scene.schema.json'), 'utf8'));
    const { ir } = planWhiteboardIr(SRT_KO, { id: 'wb' });
    let checked = 0;
    for (const scene of ir.scenes) {
      for (const layer of scene.layers) {
        if (layer.render?.plugin !== 'whiteboard') continue;
        const r = validate(layer.render, schema);
        assert(r.valid, `${scene.id}.${layer.id}: ${JSON.stringify(r.errors)}`);
        checked += 1;
      }
    }
    assert(checked > 0, 'whiteboard 레이어가 하나도 없습니다');
  });

  test('장면 타임라인에 공백이나 겹침이 없다', () => {
    const { ir } = planWhiteboardIr(SRT_KO, { id: 'wb', targetMs: 5000, minMs: 3000, maxMs: 8000 });
    let cursor = 0;
    for (const s of ir.scenes) {
      assert(s.startMs === cursor, `${s.id}: ${cursor}ms에서 시작해야 하는데 ${s.startMs}ms`);
      cursor = s.startMs + s.durationMs;
    }
  });

  test('모든 레이어가 자기 장면 안에서 등장한다', () => {
    const { ir } = planWhiteboardIr(SRT_KO, { id: 'wb' });
    for (const s of ir.scenes) {
      for (const l of s.layers) {
        assert(l.enterMs < s.durationMs, `${s.id}.${l.id}: enterMs=${l.enterMs} ≥ 장면 ${s.durationMs}ms — 화면에 안 나옴`);
        assert(l.exitMs > l.enterMs, `${s.id}.${l.id}: exit ≤ enter`);
      }
    }
  });

  test('요소 배치가 안전영역 안에 머문다', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 8]) {
      const area = { x: 120, y: 80, w: 1680, h: 840 };
      for (const r of layoutRegions(n, area)) {
        assert(r.x >= area.x - 1 && r.y >= area.y - 1, `n=${n}: 좌상단 이탈`);
        assert(r.x + r.w <= area.x + area.w + 1, `n=${n}: 우측 이탈 (${r.x + r.w} > ${area.x + area.w})`);
        assert(r.y + r.h <= area.y + area.h + 1, `n=${n}: 하단 이탈 (${r.y + r.h} > ${area.y + area.h})`);
      }
    }
  });

  /* ── 보호 마스크 ── */

  test('겹치는 뒤 요소를 보호 영역으로 자동 도출한다', () => {
    const layers = [
      { id: 'a', region: { x: 0, y: 0, w: 200, h: 200 } },
      { id: 'b', region: { x: 100, y: 100, w: 200, h: 200 } },
      { id: 'c', region: { x: 900, y: 900, w: 100, h: 100 } },
    ];
    const derived = deriveProtectedRegions(layers);
    assert(derived[0].length === 1, `a의 보호 영역 ${derived[0].length}개 (기대 1)`);
    assert(derived[0][0].x === 100, '엉뚱한 영역을 보호 대상으로 잡음');
    assert(derived[2].length === 0, '마지막 요소는 보호할 대상이 없어야 함');
  });

  test('선노출 검사가 빠진 보호 영역을 잡는다', () => {
    const canvas = { width: 1920, height: 1080 };
    const layers = [
      { id: 'a', region: { x: 0, y: 0, w: 400, h: 400 } },
      { id: 'b', region: { x: 200, y: 200, w: 400, h: 400 } },
    ];
    assert(auditMask(layers, canvas).length === 1, '선노출을 놓쳤습니다');
    const [prot] = deriveProtectedRegions(layers);
    layers[0].protectedRegions = prot;
    assert(auditMask(layers, canvas).length === 0, `보호 선언 후에도 문제 보고: ${JSON.stringify(auditMask(layers, canvas))}`);
  });

  test('허용 경로가 캔버스 밖을 자동으로 차단한다', () => {
    const canvas = { width: 1000, height: 800 };
    const { d } = buildAllowedPath({ x: 900, y: 700, w: 400, h: 400 }, [], canvas, 0);
    assert(d.includes('H1000'), `캔버스 폭을 넘김: ${d}`);
    assert(!/H1[1-9]\d\d/.test(d), `캔버스 밖 좌표가 남음: ${d}`);
  });

  test('보호 영역이 clipPath 구멍으로 들어간다', () => {
    const canvas = { width: 1000, height: 800 };
    const res = buildAllowedPath({ x: 0, y: 0, w: 600, h: 600 }, [{ x: 300, y: 300, w: 200, h: 200 }], canvas, 0);
    assert(res.holes === 1, `구멍 ${res.holes}개 (기대 1)`);
    assert(res.d.split('Z').length === 3, `경로에 사각형이 2개여야 함: ${res.d}`);
  });

  test('겹치지 않는 보호 영역은 구멍을 만들지 않는다', () => {
    const canvas = { width: 1000, height: 800 };
    const res = buildAllowedPath({ x: 0, y: 0, w: 200, h: 200 }, [{ x: 700, y: 700, w: 100, h: 100 }], canvas, 0);
    assert(res.holes === 0, '겹치지 않는데 구멍을 팠습니다');
  });

  test('쓸어내기 사각형이 방향별로 맞다', () => {
    const r = { x: 100, y: 100, w: 400, h: 200 };
    assert(sweepRect(r, 'left-right', 0.5).w === 200, 'left-right 폭 오류');
    assert(sweepRect(r, 'right-left', 0.5).x === 300, 'right-left 시작점 오류');
    assert(sweepRect(r, 'top-bottom', 0.5).h === 100, 'top-bottom 높이 오류');
    assert(sweepRect(r, 'bottom-top', 0.5).y === 200, 'bottom-top 시작점 오류');
    assert(sweepRect(r, 'left-right', 0).w === 0 && sweepRect(r, 'left-right', 1).w === 400, '경계값 오류');
  });

  /* ── 렌더 ── */

  test('줄바꿈이 영역 폭을 넘지 않는다', () => {
    const size = 40;
    const maxW = 400;
    for (const line of wrapText('설계 문서를 아무리 잘 써도 사람은 그걸 다 읽지 않습니다', size, maxW)) {
      const w = [...line].reduce((n, ch) => n + (ch.codePointAt(0) >= 0xac00 ? size : size * 0.52), 0);
      assert(w <= maxW * 1.02, `"${line}" 폭 ${Math.round(w)} > ${maxW}`);
    }
  });

  test('공백 없는 긴 문자열도 잘린다', () => {
    const lines = wrapText('가'.repeat(60), 40, 400);
    assert(lines.length >= 6, `줄 ${lines.length}개 — 잘리지 않았습니다`);
  });

  test('같은 레이어를 두 번 렌더하면 같은 HTML이 나온다', () => {
    const ir = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'ir', 'board.json'), 'utf8'));
    const scene = ir.scenes[0];
    const args = { scene, layer: scene.layers[0], canvas: ir.canvas, assetSrc: () => 'hand.svg', uid: 'x' };
    assert(renderWhiteboardLayer(args).html === renderWhiteboardLayer(args).html, '렌더가 결정론적이지 않습니다');
  });

  test('보호 영역이 있으면 clipPath에 구멍이 생긴다', () => {
    const ir = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'ir', 'board.json'), 'utf8'));
    const scene = ir.scenes[0];
    const res = renderWhiteboardLayer({
      scene, layer: scene.layers[0], canvas: ir.canvas, assetSrc: () => 'hand.svg', uid: 'x',
    });
    assert(res.maskHoles === 1, `구멍 ${res.maskHoles}개 — 보호 영역이 마스크에 반영되지 않았습니다`);
  });

  test('ink와 color 단계가 시간상 분리된다', () => {
    const ir = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'ir', 'board.json'), 'utf8'));
    const scene = ir.scenes[0];
    const { runtime } = renderWhiteboardLayer({
      scene, layer: scene.layers[0], canvas: ir.canvas, assetSrc: () => 'hand.svg', uid: 'x',
    });
    const ink = runtime.phases.find((p) => p.kind === 'ink');
    const col = runtime.phases.find((p) => p.kind === 'color');
    assert(ink && col, '두 단계가 모두 있어야 합니다');
    assert(col.startMs >= ink.startMs + ink.durationMs, `색이 선보다 먼저 시작: ink ${ink.startMs}+${ink.durationMs}, color ${col.startMs}`);
  });

  /* ── 오디오 ── */

  test('음성·BGM이 있으면 더킹 필터와 최종본이 계획된다', () => {
    const ctx = { dir: FIXTURE, manifest: JSON.parse(fs.readFileSync(path.join(FIXTURE, 'design-project.json'), 'utf8')) };
    const ir = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'ir', 'board.json'), 'utf8'));
    const plan = buildMixPlan(ctx, ctx.manifest.artifacts[0], ir);
    assert(plan.missing.length === 0, `소스 누락: ${plan.missing.join(', ')}`);
    assert(plan.filters.some((f) => f.includes('sidechaincompress')), '더킹 필터가 없습니다');
    assert(plan.filters.some((f) => f.includes('loudnorm=I=-16')), '라우드니스 정규화가 없습니다');
    assert(plan.commands.length === 1, `명령 ${plan.commands.length}개`);
  });

  test('무음 작업본과 최종본을 모두 낸다', () => {
    const ctx = { dir: FIXTURE, manifest: JSON.parse(fs.readFileSync(path.join(FIXTURE, 'design-project.json'), 'utf8')) };
    const ir = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'ir', 'board.json'), 'utf8'));
    const names = buildMixPlan(ctx, ctx.manifest.artifacts[0], ir).targets.map((t) => t.name);
    assert(names.some((n) => n.endsWith('-silent.mp4')), `무음본 없음: ${names.join(', ')}`);
    assert(names.some((n) => n === 'board.mp4'), `최종본 없음: ${names.join(', ')}`);
  });

  test('자막 트랙이 소프트 서브로 붙는다', () => {
    const ctx = { dir: FIXTURE, manifest: JSON.parse(fs.readFileSync(path.join(FIXTURE, 'design-project.json'), 'utf8')) };
    const ir = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'ir', 'board.json'), 'utf8'));
    const plan = buildMixPlan(ctx, ctx.manifest.artifacts[0], ir);
    assert(plan.commands[0].cmd.includes('mov_text'), `소프트 자막이 없음: ${plan.commands[0].cmd}`);
    assert(!plan.commands[0].cmd.includes('subtitles='), 'burnIn=false인데 번인 필터가 붙음');
  });

  test('오디오 소스가 없으면 실행 대신 안내한다', () => {
    const ctx = { dir: FIXTURE, manifest: JSON.parse(fs.readFileSync(path.join(FIXTURE, 'design-project.json'), 'utf8')) };
    const ir = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'ir', 'board.json'), 'utf8'));
    ir.audio = { voiceover: { path: 'audio/nope.mp3' }, silentVariant: true };
    const plan = buildMixPlan(ctx, ctx.manifest.artifacts[0], ir);
    assert(plan.missing.includes('voiceover'), '없는 파일을 못 잡음');
    assert(plan.commands.length === 0, '소스가 없는데 명령을 만들었습니다');
  });

  /* ── 기하 보조 ── */

  test('교집합 계산이 맞다', () => {
    assert(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }).w === 5, '교집합 폭 오류');
    assert(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }) === null, '맞닿은 사각형을 겹친다고 판정');
  });
}
