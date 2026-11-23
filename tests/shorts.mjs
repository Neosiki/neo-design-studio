/** Shorts studio regressions: script parsing, caption timing/ASS structure, consent gates; no network calls. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseScript, tokenize, estimateWords, estimateSentences } from '../skills/shorts-studio/scripts/shorts-pipeline.mjs';
import { paginate, buildAss } from '../skills/shorts-studio/scripts/subtitle-ass.mjs';
import { parseVtt } from '../skills/shorts-studio/scripts/cloud/tts-edge.mjs';
import { parseArgs as parseComposeArgs, escapeFilterPath, buildFfmpegArgs } from '../skills/shorts-studio/scripts/shorts-compose.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = path.join(ROOT, 'skills', 'shorts-studio');
const node = process.execPath;
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const hasProbe = spawnSync('ffprobe', ['-version']).status === 0;
const hasAss = hasFfmpeg && /\bass\b/.test(spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' }).stdout || '');

const SCRIPT = `---
title: 시험
gap: 0.2
---
## hook
**지금**, 우리 동네 사진관이에요.

## s1
계절마다 다른 배경으로 한 해를 기록해 드려요.
`;

function timeline() {
  const words = estimateWords(tokenize('**지금**, 우리 동네 사진관이에요 오늘 예약하면 첫 촬영이 가벼워집니다.').words, null, 6).map(w => ({ ...w, absoluteStart: w.start, absoluteEnd: w.end }));
  return { totalDuration: 6, scenes: [{ id: 'a', chunks: [{ words }] }] };
}

export function run(test, assert) {
  test('쇼츠 대본: 머리글과 장면을 읽는다', () => {
    const { meta, scenes } = parseScript(SCRIPT);
    assert(meta.title === '시험' && meta.gap === '0.2', `머리글 ${JSON.stringify(meta)}`);
    assert(scenes.length === 2 && scenes[0].id === 'hook' && scenes[1].id === 's1', `장면 ${scenes.map(s => s.id)}`);
  });

  test('쇼츠 대본: 강조 표기는 걷어내고 강조 낱말만 표시한다', () => {
    const { plain, words } = tokenize('**지금**, 우리 **동네** 사진관');
    assert(plain === '지금, 우리 동네 사진관', plain);
    assert(words.map(w => w.em).join() === 'true,false,true,false', JSON.stringify(words));
  });

  test('쇼츠 타이밍: 낱말 구간이 끊기지 않고 문장 경계를 넘지 않는다', () => {
    const sentences = estimateSentences('안녕하세요 대표님. 오늘 시작해요.', 4);
    const { words } = tokenize('안녕하세요 대표님. 오늘 시작해요.');
    const w = estimateWords(words, sentences, 4);
    assert(w.length === 4 && w.every(x => x.end > x.start), JSON.stringify(w));
    assert(w[1].end <= sentences[0].end + 0.002 && w[2].start >= sentences[1].start - 0.002, '문장 경계를 넘음');
    for (let i = 1; i < w.length; i++) assert(w[i].start >= w[i - 1].end - 0.002, '낱말 구간이 겹침');
  });

  test('자막 쪽 나누기: 낱말을 자르지 않고 한 줄 길이를 지킨다', () => {
    const { words } = tokenize('지금 이 사진 우리 동네에서 찍을 수 있어요 계절마다 다른 배경으로 한 해를 기록해 드려요');
    const pages = paginate(words, 11);
    assert(pages.flatMap(p => p.words).length === words.length, '낱말 수가 달라짐');
    for (const p of pages) for (const ln of p.lines) assert(ln.map(w => w.text).join(' ').length <= 11 || ln.length === 1, `줄 초과: ${ln.map(w => w.text)}`);
    assert(pages.every(p => p.lines.length <= 3), '3줄 초과');
  });

  test('ASS: Events Format과 Dialogue 열 수가 맞고 스타일이 정의된다', () => {
    for (const preset of ['karaoke', 'pop', 'box']) {
      const ass = buildAss(timeline(), { preset, size: '1080x1920', font: 'Malgun Gothic', hl: 'FFE14D', em: 'FF6B6B', title: '매장' });
      const fmt = ass.match(/\[Events\]\nFormat: (.*)/)[1].split(',').length;
      const dlg = ass.split('\n').filter(l => l.startsWith('Dialogue:'));
      assert(/Format: Layer,Start,End,Style,Name/.test(ass), `${preset}: Style 열 없음`);
      assert(dlg.length >= 2, `${preset}: 자막 줄 없음`);
      for (const l of dlg) assert(l.slice('Dialogue: '.length).split(',').length >= fmt, `${preset}: 열 수 부족 ${l.slice(0, 60)}`);
      assert(/^Style: Main,/m.test(ass) && /^Style: Title,/m.test(ass), `${preset}: 스타일 누락`);
      const styleFmt = ass.match(/Format: Name,Fontname.*/)[0].split(',').length;
      for (const l of ass.split('\n').filter(x => x.startsWith('Style:'))) assert(l.slice(7).split(',').length === styleFmt, `${preset}: 스타일 열 수 ${l.slice(0, 40)}`);
    }
  });

  test('ASS: 카라오케 강조색은 다음 낱말로 번지지 않고 쪽이 겹치지 않는다', () => {
    const ass = buildAss(timeline(), { preset: 'karaoke', size: '1080x1920', font: 'F', hl: 'FFE14D', em: 'FF6B6B' });
    const dlg = ass.split('\n').filter(l => l.startsWith('Dialogue: 1'));
    const t = s => { const m = s.match(/(\d+):(\d+):(\d+)\.(\d+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 100; };
    for (let i = 1; i < dlg.length; i++) assert(t(dlg[i].split(',')[1]) >= t(dlg[i - 1].split(',')[2]) - 0.001, '쪽 시간이 겹침');
    const kf = dlg.join('').match(/\\kf\d+\\1c&H[0-9A-F]{6}&/g) || [];
    assert(kf.length > 0 && kf.every(x => /&H(4DE1FF|6B6BFF)&/.test(x)), '낱말마다 색이 지정되지 않음');
  });

  test('Edge VTT 문장 경계를 읽는다', () => {
    const r = parseVtt('WEBVTT\n\n00:00:00.100 --> 00:00:02.300\n안녕하세요.\n\n00:00:02.500 --> 00:00:04.000\n시작해요.\n');
    assert(r.length === 2 && r[0].start === 0.1 && r[1].end === 4 && r[1].text === '시작해요.', JSON.stringify(r));
  });

  test('승인 없이는 Edge 음성 전송이 막힌다(종료 코드 2)', () => {
    const env = { ...process.env, DESIGN_CLOUD_OK: '' };
    const a = spawnSync(node, [path.join(S, 'scripts', 'cloud', 'tts-edge.mjs'), '--text', 'x', '--out', path.join(os.tmpdir(), 'x.mp3')], { encoding: 'utf8', env });
    assert(a.status === 2, `tts-edge 종료 코드 ${a.status}`);
    const b = spawnSync(node, [path.join(S, 'scripts', 'shorts-pipeline.mjs'), '--script', path.join(S, 'examples', 'shorts-sample.md'), '--out-dir', path.join(os.tmpdir(), 'x'), '--provider', 'edge'], { encoding: 'utf8', env });
    assert(b.status === 2, `pipeline 종료 코드 ${b.status}`);
    const c = spawnSync(node, [path.join(S, 'scripts', 'shorts-batch.mjs'), '--csv', path.join(S, 'examples', 'batch-sample.csv'), '--out-dir', path.join(os.tmpdir(), 'y'), '--provider', 'edge'], { encoding: 'utf8', env });
    assert(c.status === 2, `batch 종료 코드 ${c.status}`);
  });

  test('합성: 필수 옵션과 알 수 없는 옵션을 검사한다', () => {
    const a = parseComposeArgs(['--voiceover', 'v.mp3', '--out', 'o.mp4', '--bgm-vol', '0.2']);
    assert(a.voiceover === 'v.mp3' && a.out === 'o.mp4' && a.size === '1080x1920' && a.bgmVol === '0.2', JSON.stringify(a));
    let threw = 0;
    for (const bad of [['--out', 'o.mp4'], ['--voiceover', 'v.mp3', '--out', 'o.mp4', '--nope', 'x'], ['--voiceover', 'v.mp3', '--out', 'o.mp4', '--size', '720p'], ['--voiceover', 'v.mp3', '--out']]) {
      try { parseComposeArgs(bad); } catch { threw++; }
    }
    assert(threw === 4, `오류를 낸 경우 ${threw}/4`);
  });

  test('합성: Windows 경로의 콜론·역슬래시와 작은따옴표를 필터용으로 이스케이프한다', () => {
    assert(escapeFilterPath('C:\\Users\\a b\\subs.ass') === "'C\\:/Users/a b/subs.ass'", escapeFilterPath('C:\\Users\\a b\\subs.ass'));
    assert(escapeFilterPath("o'k.ass") === "'o'\\\\\\''k.ass'", escapeFilterPath("o'k.ass"));
    assert(escapeFilterPath('_shorts/subs.ass') === "'_shorts/subs.ass'", '상대 경로는 그대로');
  });

  test('합성: 입력 종류와 BGM 유무에 따라 FFmpeg 인자가 달라진다', () => {
    const base = { voiceover: 'v.mp3', out: 'o.mp4', size: '1080x1920', bgmVol: '0.35', lufs: '-14' };
    const plain = buildFfmpegArgs(base, 15.8), join = x => x.join(' ');
    assert(join(plain).includes('color=c=0x263a2e:s=1080x1920') && !join(plain).includes('sidechaincompress') && plain.at(-1) === 'o.mp4', '단색·BGM 없음');
    const full = buildFfmpegArgs({ ...base, video: 'bg.mp4', bgm: 'b.mp3', ass: 'C:\\x\\s.ass', fontsdir: 'C:\\Windows\\Fonts' }, 15.8);
    const f = full[full.indexOf('-filter_complex') + 1];
    assert(join(full).includes('-stream_loop -1 -i bg.mp4') && f.includes('sidechaincompress') && f.includes("ass='C\\:/x/s.ass':fontsdir='C\\:/Windows/Fonts'"), f);
    assert(full[full.indexOf('-t') + 1] === '15.8', '길이는 음성 길이');
    assert(join(buildFfmpegArgs({ ...base, image: 'p.jpg' }, 5)).includes('-loop 1 -i p.jpg'), '이미지 입력');
  });

  test('자막: 프리셋을 주지 않으면 pop이 기본이다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neodesign-shorts-test-'));
    try {
      const tl = path.join(dir, 't.json');
      fs.writeFileSync(tl, JSON.stringify(timeline()));
      const r = spawnSync(node, [path.join(S, 'scripts', 'subtitle-ass.mjs'), '--timeline', tl, '--out', path.join(dir, 's.ass')], { encoding: 'utf8' });
      assert(r.status === 0 && /preset=pop/.test(r.stdout), `${r.status} ${r.stdout} ${r.stderr}`);
      assert(/\\fscx85/.test(fs.readFileSync(path.join(dir, 's.ass'), 'utf8')), 'pop 효과가 없음');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('업종 프리셋의 자막은 모두 유효하다(pop이 기본)', () => {
    const presets = JSON.parse(fs.readFileSync(path.join(S, 'scripts', 'shorts-presets.json'), 'utf8'));
    const items = Object.entries(presets).filter(([k]) => !k.startsWith('_'));
    assert(items.length === 5 && items.every(([, v]) => ['pop', 'karaoke', 'box'].includes(v.caption)), JSON.stringify(items.map(([k, v]) => [k, v.caption])));
    assert(items.every(([, v]) => v.caption === 'pop'), 'pop이 아닌 프리셋이 있음');
  });

  if (hasFfmpeg && hasProbe && hasAss) {
    test('합성: 공백·작은따옴표가 든 경로에서도 자막이 얹힌 MP4가 만들어진다', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neodesign shorts 'test' "));
      try {
        const sp = path.join(dir, 's.md');
        fs.writeFileSync(sp, SCRIPT);
        const o = path.join(dir, 'o');
        const p = spawnSync(node, [path.join(S, 'scripts', 'shorts-pipeline.mjs'), '--script', sp, '--out-dir', o, '--provider', 'silent'], { encoding: 'utf8' });
        assert(p.status === 0, `pipeline ${p.stderr}`);
        const a = spawnSync(node, [path.join(S, 'scripts', 'subtitle-ass.mjs'), '--timeline', path.join(o, 'timeline.json'), '--out', path.join(o, 'subs.ass')], { encoding: 'utf8' });
        assert(a.status === 0, `ass ${a.stderr}`);
        const out = path.join(o, 'out.mp4');
        const c = spawnSync(node, [path.join(S, 'scripts', 'shorts-compose.mjs'), '--voiceover', path.join(o, 'voiceover.mp3'), '--ass', path.join(o, 'subs.ass'), '--out', out, '--size', '540x960'], { encoding: 'utf8' });
        assert(c.status === 0 && /완료:/.test(c.stdout), `compose ${c.status} ${c.stdout} ${c.stderr}`);
        const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out], { encoding: 'utf8' });
        assert(probe.stdout.trim() === '540,960', `해상도 ${probe.stdout}`);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    test('합성: 음성 파일이 없으면 종료 코드 1과 안내 문구를 낸다', () => {
      const r = spawnSync(node, [path.join(S, 'scripts', 'shorts-compose.mjs'), '--voiceover', path.join(os.tmpdir(), 'no-such.mp3'), '--out', path.join(os.tmpdir(), 'x.mp4')], { encoding: 'utf8' });
      assert(r.status === 1 && /음성 길이를 읽지 못했습니다/.test(r.stderr), `${r.status} ${r.stderr}`);
    });
  }

  if (hasFfmpeg) {
    test('리허설(silent) 파이프라인이 timeline.json과 voiceover.mp3를 만든다', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neodesign-shorts-test-'));
      try {
        const sp = path.join(dir, 's.md');
        fs.writeFileSync(sp, SCRIPT);
        const r = spawnSync(node, [path.join(S, 'scripts', 'shorts-pipeline.mjs'), '--script', sp, '--out-dir', path.join(dir, 'o'), '--provider', 'silent'], { encoding: 'utf8' });
        assert(r.status === 0, `종료 ${r.status}: ${r.stderr}`);
        const tl = JSON.parse(fs.readFileSync(path.join(dir, 'o', 'timeline.json'), 'utf8'));
        assert(tl.scenes.length === 2 && tl.timingsEstimated === true && tl.totalDuration > 1, JSON.stringify(tl).slice(0, 200));
        assert(tl.scenes[1].start >= tl.scenes[0].end, '장면이 겹침');
        assert(fs.existsSync(path.join(dir, 'o', 'voiceover.mp3')), 'voiceover.mp3 없음');
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    test('규칙 점검: 장면이 9개를 넘으면 경고한다', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neodesign-shorts-test-'));
      try {
        const sp = path.join(dir, 's.md');
        fs.writeFileSync(sp, Array.from({ length: 9 }, (_, i) => `## s${i}\n짧아요.\n`).join('\n'));
        const r = spawnSync(node, [path.join(S, 'scripts', 'shorts-pipeline.mjs'), '--script', sp, '--out-dir', path.join(dir, 'o'), '--provider', 'silent'], { encoding: 'utf8' });
        assert(/장면 9개/.test(r.stdout), r.stdout);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
  }
}
