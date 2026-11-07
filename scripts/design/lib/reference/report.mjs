import { WIDTH, HEIGHT, framePixels } from './media.mjs';

export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const seconds = (value) => value.toFixed(3) + '초';
const kind = { cut: '컷 후보', flash: '한 프레임 플래시 후보', 'caption-region': '자막 영역 변화 후보' };
const label = {
  duration: '길이 차이(ms)', canvas: '표시 해상도 차이', 'frame-rate': '프레임률 차이',
  'frame-count': '프레임 수 차이', 'shifted-events': '시간이 다른 이벤트',
  'missing-events': '원본에만 있는 이벤트', 'extra-events': '렌더에만 있는 이벤트',
  'pixel-difference': '화면 차이 기준을 넘은 프레임', 'missing-audio': '렌더 오디오 없음',
  'extra-audio': '렌더에 오디오 추가', 'audio-offset': '오디오 시간 차이 추정(ms)',
};

// The RGB proxy already exists in memory. BMP embeds it without a separate renderer.
function bitmap(video, index) {
  const frame = framePixels(video, index);
  const stride = Math.ceil(WIDTH * 3 / 4) * 4;
  const bytes = Buffer.alloc(54 + stride * HEIGHT);
  bytes.write('BM');
  bytes.writeUInt32LE(bytes.length, 2);
  bytes.writeUInt32LE(54, 10);
  bytes.writeUInt32LE(40, 14);
  bytes.writeInt32LE(WIDTH, 18);
  bytes.writeInt32LE(-HEIGHT, 22);
  bytes.writeUInt16LE(1, 26);
  bytes.writeUInt16LE(24, 28);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const from = (y * WIDTH + x) * 3;
      const to = 54 + y * stride + x * 3;
      bytes[to] = frame[from + 2];
      bytes[to + 1] = frame[from + 1];
      bytes[to + 2] = frame[from];
    }
  }
  return 'data:image/bmp;base64,' + bytes.toString('base64');
}

function figure(video, index, name) {
  const { width, height, frames } = video.metadata;
  const caption = name + ' · 프레임 ' + index + ' · ' + seconds(frames[index].seconds);
  return '<figure><img src="' + bitmap(video, index) + '" alt="' + escapeHtml(caption)
    + '" style="aspect-ratio:' + width + '/' + height + '"><figcaption>' + escapeHtml(caption) + '</figcaption></figure>';
}

function table(headers, rows) {
  return '<div class="scroll"><table><thead><tr>' + headers.map(header => '<th scope="col">' + escapeHtml(header) + '</th>').join('')
    + '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(value => '<td>' + escapeHtml(value) + '</td>').join('')).join('')
    + '</tbody></table></div>';
}

function document(title, body) {
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">'
    + '<title>' + escapeHtml(title) + '</title><style>'
    + 'body{margin:0;background:#f4f5f7;color:#17283a;font:16px/1.65 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:36px 20px}h1{font-size:clamp(26px,4vw,38px);margin:0}h2{font-size:22px;margin-top:32px}h3{font-size:16px}p,td,figcaption{overflow-wrap:anywhere}section{background:#fff;border:1px solid #d5dce4;border-radius:12px;padding:16px;margin:14px 0}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #dbe1e8}th{background:#edf2f7}.frames{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:12px}figure{margin:0}img{display:block;width:100%;background:#101a22;max-height:440px}figcaption{padding-top:6px;color:#405569;font-size:14px}</style></head>'
    + '<body><main><h1>' + escapeHtml(title) + '</h1>' + body + '</main></body></html>';
}

function summary(metadata) {
  return escapeHtml(metadata.name) + ' · ' + metadata.width + '×' + metadata.height
    + ' · ' + metadata.fps.numerator + '/' + metadata.fps.denominator + 'fps'
    + (metadata.variableFrameRate ? ' (가변)' : '') + ' · ' + metadata.frameCount + '프레임 · ' + seconds(metadata.duration);
}

export function inspectionReport(result, video) {
  const rows = result.events.map(event => [kind[event.type], event.frame, seconds(event.seconds), event.score]);
  const strips = result.events.slice(0, 16).map(event => {
    const indices = [event.frame - 1, event.frame, event.frame + 1].filter(index => index >= 0 && index < video.metadata.frameCount);
    return '<section><h3>' + kind[event.type] + ' · 프레임 ' + event.frame + '</h3><div class="frames">'
      + indices.map(index => figure(video, index, '원본')).join('') + '</div></section>';
  }).join('');
  const captions = result.captions?.length ? '<h2>SRT에서 가져온 자막</h2>'
    + table(['텍스트', '시작 프레임', '끝 프레임(제외)', '표시 시각'],
      result.captions.map(cue => [cue.text, cue.startFrame, cue.endFrameExclusive, seconds(cue.startSeconds)])) : '';
  const warnings = result.warnings?.length ? '<h2>자막 확인 사항</h2><ul>'
    + result.warnings.map(message => '<li>' + escapeHtml(message) + '</li>').join('') + '</ul>' : '';
  return document('참조 영상 분석', '<p>' + summary(result.source) + '</p>'
    + '<p>이벤트는 96×54 RGB 표본의 변화로 찾은 후보입니다. 아래 전후 프레임에서 컷과 자막 전환을 확인하세요.</p>'
    + '<h2>샷 계획</h2>' + table(['샷', '첫 프레임', '끝 프레임(제외)', '시작', '길이'],
      result.shots.map(shot => [shot.id, shot.startFrame, shot.endFrameExclusive, seconds(shot.startSeconds), seconds(shot.duration)]))
    + '<h2>이벤트 ' + rows.length + '건</h2>'
    + (rows.length ? table(['종류', '프레임', '표시 시각', '변화량'], rows) : '<p>설정한 기준을 넘은 이벤트가 없습니다.</p>')
    + captions + warnings + (strips ? '<h2>이벤트 전후 프레임 · 처음 16건</h2>' + strips : ''));
}

export function comparisonReport(result, source, render) {
  const findings = result.findings.map(item => [label[item.type], item.value === true ? '확인 필요' : item.value]);
  const rows = result.events.matches.filter(item => item.status === 'shifted')
    .map(item => [kind[item.type], item.source.frame, item.render.frame, seconds(item.source.seconds), item.offsetMs + 'ms']);
  for (const item of result.events.missing) rows.push([kind[item.type], item.frame, '누락 후보', seconds(item.seconds), '']);
  for (const item of result.events.extra) rows.push([kind[item.type], '추가 후보', item.frame, seconds(item.seconds), '']);
  const audio = result.audio.status === 'estimated'
    ? '오디오 시간 차이 추정 ' + result.audio.offsetMs + 'ms · 상관 ' + result.audio.correlation + ' · 간격 ' + result.audio.resolutionMs + 'ms'
    : ({ 'no-audio': '두 영상 모두 오디오 없음', 'missing-audio': '렌더에 오디오 없음',
      'extra-audio': '렌더에 오디오 추가', uncertain: '오디오 시간 차이 산정 보류' })[result.audio.status];
  const pairs = result.comparison.worst.map(item => '<section><h3>' + seconds(item.seconds) + ' · 화면 차이 ' + item.score
    + '</h3><div class="frames">' + figure(source, item.sourceFrame, '원본') + figure(render, item.renderFrame, '렌더')
    + '</div></section>').join('');
  return document('원본과 렌더 대조', '<p>원본 ' + summary(result.source) + '<br>렌더 ' + summary(result.render) + '</p>'
    + '<p>' + result.comparison.framesCompared + '프레임 대조 · 이벤트 허용차 ' + result.toleranceMs + 'ms · ' + audio + '</p>'
    + '<h2>확인할 차이</h2>'
    + (findings.length ? table(['항목', '결과'], findings) : '<p>설정한 비교 기준에서 차이 후보가 없습니다.</p>')
    + (rows.length ? '<h2>시간이 다르거나 짝이 없는 이벤트</h2>'
      + table(['종류', '원본 프레임', '렌더 프레임', '이벤트 시각', '렌더 − 원본'], rows) : '')
    + (pairs ? '<h2>화면 차이가 큰 시점</h2>' + pairs : '')
    + '<p>화면 비교는 축소한 RGB 표본 기준입니다. 자막 영역의 배경 움직임과 인코딩 차이도 검출될 수 있습니다. 양수 오디오 시간 차이는 렌더가 더 늦다는 뜻입니다.</p>');
}
