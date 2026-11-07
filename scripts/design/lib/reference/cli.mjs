import fs from 'node:fs';
import path from 'node:path';
import { EXIT } from '../util.mjs';
import { parseSrt } from '../srt.mjs';
import { loadVideo } from './media.mjs';
import { inspectVideo, compareVideos } from './analysis.mjs';
import { inspectionReport, comparisonReport } from './report.mjs';

function numberFlag(flags, key, fallback, minimum, maximum) {
  if (flags[key] === undefined) return fallback;
  const number = Number(flags[key]);
  if (typeof flags[key] !== 'string' || !flags[key].trim() || !Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error('--' + key + '는 ' + minimum + '~' + maximum + ' 범위의 숫자여야 합니다.');
  }
  return number;
}

function optionsFor(flags, action) {
  const allowed = ['out', 'roi', 'cut-threshold', 'caption-threshold'];
  if (action === 'compare') allowed.push('pixel-threshold', 'tolerance-ms', 'strict');
  else allowed.push('srt');
  for (const key of Object.keys(flags)) if (!allowed.includes(key)) throw new Error('알 수 없는 옵션: --' + key);
  if (flags.strict !== undefined && flags.strict !== true) throw new Error('--strict는 값 없이 사용합니다.');
  const values = typeof flags.roi === 'string' ? flags.roi.split(',') : [];
  if (flags.roi !== undefined && (values.length !== 4 || values.some(value => !/^\s*\d+\s*$/.test(value)))) {
    throw new Error('--roi x,y,너비,높이를 화면 픽셀의 정수로 지정하세요.');
  }
  if (typeof flags.out !== 'string' || !flags.out.trim()) throw new Error('--out에 새 결과 폴더를 지정하세요.');
  return {
    roi: values.length ? values.map(Number) : null,
    cutThreshold: numberFlag(flags, 'cut-threshold', 0.26, 0.001, 1),
    captionThreshold: numberFlag(flags, 'caption-threshold', 0.045, 0.001, 1),
    pixelThreshold: numberFlag(flags, 'pixel-threshold', 0.045, 0.001, 1),
    toleranceMs: numberFlag(flags, 'tolerance-ms', undefined, 0, 1000),
  };
}

function readCaptions(file, source) {
  if (typeof file !== 'string' || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error('--srt에 로컬 SRT 파일을 지정하세요.');
  }
  if (fs.statSync(file).size > 1024 * 1024) throw new Error('SRT 입력은 1MB까지 지원합니다.');
  const { cues, warnings } = parseSrt(fs.readFileSync(file));
  const captions = [];
  for (const cue of cues) {
    const startFrame = source.frames.findIndex(frame => frame.seconds * 1000 >= cue.startMs - 0.5);
    if (startFrame < 0) { warnings.push('영상 범위 밖의 자막 큐 ' + cue.index + '을 건너뜁니다.'); continue; }
    const end = source.frames.findIndex(frame => frame.seconds * 1000 >= cue.endMs - 0.5);
    const endFrameExclusive = end < 0 ? source.frameCount : end;
    if (endFrameExclusive <= startFrame || !cue.text) continue;
    captions.push({ ...cue, startFrame, endFrameExclusive,
      startSeconds: source.frames[startFrame].seconds, endSeconds: source.frames[endFrameExclusive]?.seconds ?? source.duration });
  }
  return { captions, warnings };
}

const json = (value) => JSON.stringify(value, null, 2) + '\n';
const decimal = (value) => value.toFixed(9);

function scenePage(shot, canvas, captions) {
  const local = captions.filter(cue => cue.startSeconds < shot.endSeconds && cue.endSeconds > shot.startSeconds)
    .map(cue => ({ start: Math.max(0, cue.startSeconds - shot.startSeconds),
      end: Math.min(shot.duration, cue.endSeconds - shot.startSeconds), text: cue.lines.join('\n') }));
  const data = JSON.stringify(local).replaceAll('<', '\\u003c');
  return '<!doctype html><html lang="ko"><meta charset="utf-8"><title>' + shot.id + '</title><style>'
    + 'body{margin:0;background:#14283b;color:#f1f5f9;font-family:system-ui,sans-serif;width:' + canvas.width + 'px;height:' + canvas.height + 'px;display:grid;place-items:center;position:relative;overflow:hidden}'
    + 'main{text-align:center;font-size:' + Math.max(14, Math.round(canvas.height * 0.05)) + 'px}p{margin:.4em 0}'
    + '#caption{position:absolute;bottom:6%;left:6%;right:6%;text-align:center;white-space:pre-line;font-size:' + Math.max(12, Math.round(canvas.height * 0.033)) + 'px}</style>'
    + '<main><p>' + shot.id + ' · 재구성 초안</p><p>프레임 ' + shot.startFrame + '–' + (shot.endFrameExclusive - 1) + '</p></main>'
    + '<div id="caption"></div><script>const cues=' + data + ';'
    + 'const caption=document.getElementById("caption");'
    + 'function frame(t){caption.textContent=cues.filter(c=>t>=c.start&&t<c.end).map(c=>c.text).join("\\n");}'
    + 'window.film={duration:' + decimal(shot.duration) + ',frame,ready:Promise.resolve()};frame(0);</script></html>';
}

function planFiles(result) {
  if (result.shots.length > 200) throw new Error('샷 계획은 200개까지 생성합니다. 검토할 구간을 나누세요.');
  const canvas = { width: result.source.width, height: result.source.height, fps: result.source.fps.value };
  const pending = { status: 'pending', notes: '참조 영상의 컷 후보와 자막 시점을 확인하고 샷 내용을 제작하세요.' };
  const shots = result.shots.map(shot => ({
    id: shot.id, page: 'scenes/' + shot.id + '.html', duration: shot.duration, characterIds: [],
    startState: '참조 시작 프레임 ' + shot.startFrame,
    endState: '참조 마지막 프레임 ' + (shot.endFrameExclusive - 1),
    visualReview: pending,
  }));
  const plan = { schemaVersion: '1.0', id: 'reference-film', title: '참조 영상 재구성 초안',
    canvas, shots, characters: [], assets: [], generationAttempts: [], visualReview: pending };
  const clips = shots.map(shot => '<iframe id="' + shot.id + '" src="' + shot.page + '#t=0,' + decimal(shot.duration)
    + '" title="' + shot.id + '"></iframe>').join('\n');
  const film = '<!doctype html><html lang="ko"><meta charset="utf-8"><title>참조 영상 재구성 초안</title>'
    + '<style>body{margin:0}iframe{border:0;display:block;width:' + canvas.width + 'px;height:' + canvas.height + 'px}</style>'
    + '<section id="reference-shots">\n' + clips + '\n</section></html>\n';
  return [['film-plan.json', json(plan)], ['film.html', film],
    ...result.shots.map((shot, index) => [shots[index].page, scenePage(shot, canvas, result.captions ?? [])])];
}

function writeResults(directory, files) {
  const created = [];
  fs.mkdirSync(directory);
  try {
    if (files.some(([name]) => name.startsWith('scenes/'))) fs.mkdirSync(path.join(directory, 'scenes'));
    for (const [name, content] of files) {
      const file = path.join(directory, name);
      const fd = fs.openSync(file, 'wx');
      created.push(file);
      try { fs.writeFileSync(fd, content, 'utf8'); } finally { fs.closeSync(fd); }
    }
  } catch (error) {
    for (const file of created.reverse()) fs.unlinkSync(file);
    const scenes = path.join(directory, 'scenes');
    if (fs.existsSync(scenes)) fs.rmdirSync(scenes);
    fs.rmdirSync(directory);
    throw error;
  }
}

export async function referenceCommand({ positional, flags }) {
  const [action = 'help', ...inputs] = positional;
  if (action === 'help' || flags.help) {
    console.log([
      'design reference — 로컬 참조 영상 분석과 렌더 대조',
      '  inspect <원본> --out <새폴더> [--roi x,y,너비,높이] [--srt <파일>]',
      '  compare <원본> <렌더> --out <새폴더> [--roi x,y,너비,높이] [--tolerance-ms <값>] [--strict]',
      '  plan <원본> --out <새폴더> [--roi x,y,너비,높이] [--srt <파일>]',
      '  세 명령: --cut-threshold, --caption-threshold · compare: --pixel-threshold',
      '  FFmpeg/FFprobe · 영상당 최대 180초, 7,200프레임 · 자세한 사용법은 references/reference-video.md',
    ].join('\n'));
    return EXIT.OK;
  }
  if (!['inspect', 'compare', 'plan'].includes(action) || inputs.length !== (action === 'compare' ? 2 : 1)) {
    throw new Error('design reference help에서 영상 경로와 명령 형식을 확인하세요.');
  }
  const options = optionsFor(flags, action);
  const directory = path.resolve(flags.out);
  if (fs.existsSync(directory)) throw new Error('기존 결과 폴더를 덮어쓰지 않습니다: ' + directory);
  if (!fs.existsSync(path.dirname(directory))) throw new Error('결과 폴더의 상위 디렉터리를 먼저 만드세요.');
  const source = await loadVideo(inputs[0]);
  if (action === 'compare') {
    const render = await loadVideo(inputs[1]);
    const result = compareVideos(source, render, options);
    writeResults(directory, [['comparison.json', json(result)], ['comparison.html', comparisonReport(result, source, render)]]);
    console.log(json({ directory, findings: result.findings, audio: result.audio, framesCompared: result.comparison.framesCompared }));
    return flags.strict && result.findings.length ? EXIT.QA_FAILED : EXIT.OK;
  }
  const result = inspectVideo(source, options);
  if (flags.srt !== undefined) Object.assign(result, readCaptions(flags.srt, result.source));
  const files = [['reference.json', json(result)], ['reference.html', inspectionReport(result, source)]];
  if (action === 'plan') files.push(...planFiles(result));
  writeResults(directory, files);
  console.log(json({ directory, shots: result.shots.length, events: result.events.length, captionCues: result.captions?.length ?? 0 }));
  return EXIT.OK;
}
