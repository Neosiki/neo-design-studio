import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadVideo } from '../scripts/design/lib/reference/media.mjs';
import { inspectVideo, compareVideos } from '../scripts/design/lib/reference/analysis.mjs';
import { checkFilmPlan } from '../scripts/design/lib/film/plan.mjs';
import { inspectionReport } from '../scripts/design/lib/reference/report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.env.NEODESIGN_REFERENCE_FIXTURES
  ? path.resolve(process.env.NEODESIGN_REFERENCE_FIXTURES)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'neodesign-reference-'));
if (process.env.NEODESIGN_REFERENCE_FIXTURES) fs.mkdirSync(dir);
const cli = path.join(root, 'scripts/design/cli.mjs');
const options = { roi: [0, 40, 96, 14], cutThreshold: 0.26, captionThreshold: 0.045, pixelThreshold: 0.045 };
const evidence = { directory: dir, passed: 0, failures: [] };

function ffmpeg(args, input) {
  const result = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', ...args], { input, windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.toString());
}
function invoke(args, extra = {}) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', windowsHide: true, timeout: 30000, ...extra });
}
async function test(name, fn) {
  try { await fn(); evidence.passed += 1; console.log('ok ' + name); }
  catch (error) { evidence.failures.push({ name, message: error.message }); console.error('FAIL ' + name + '\n' + error.stack); }
}
function pixels(count = 40, shift = 0) {
  const data = Buffer.alloc(count * 96 * 54 * 3);
  for (let frame = 0; frame < count; frame += 1) {
    const f = Math.max(0, frame - shift);
    const color = f === 20 ? [255,255,255] : f < 10 ? [210,15,15] : f < 30 ? [15,15,210] : [15,210,15];
    for (let y = 0; y < 54; y += 1) for (let x = 0; x < 96; x += 1) {
      const subtitle = f >= 15 && y >= 42 && y < 50 && x >= 10 && x < 82;
      const p = ((frame * 54 + y) * 96 + x) * 3;
      for (let c = 0; c < 3; c += 1) data[p+c] = subtitle ? 245 : color[c];
    }
  }
  return data;
}
function fixture(name, { shift = 0, fps = '10', count = 40, filter } = {}) {
  const file = path.join(dir, name);
  const args = ['-f','rawvideo','-pix_fmt','rgb24','-s','96x54','-r',fps,'-i','pipe:0'];
  if (filter) args.push('-vf',filter,'-fps_mode','vfr');
  ffmpeg([...args,'-an','-c:v','libx264','-crf','0','-preset','ultrafast','-pix_fmt','yuv444p',file],pixels(count,shift));
  return file;
}

const original = fixture('원본 한글.mp4');
const delayed = fixture('지연.mp4',{shift:1});
let source;
await test('all displayed frames and original time basis are retained',async () => {
  source=await loadVideo(original);
  assert.equal(source.metadata.frameCount,40);
  assert.equal(source.metadata.width,96);
  assert.equal(source.metadata.duration,4);
  assert.equal(source.metadata.frames[10].seconds,1);
});
await test('cuts, one-frame flash and subtitle region change are separated',() => {
  const result=inspectVideo(source,options);
  assert.deepEqual(result.events.map(x=>[x.type,x.frame]),[['cut',10],['caption-region',15],['flash',20],['cut',30]]);
  assert.deepEqual(result.shots.map(x=>[x.startFrame,x.endFrameExclusive]),[[0,10],[10,30],[30,40]]);
});
await test('an identical render has no reported differences',async () => {
  const result=compareVideos(source,await loadVideo(original),options);
  assert.deepEqual(result.findings,[]);
  assert.equal(result.comparison.framesCompared,40);
});
await test('one-frame timing shift reports source and rendered event positions',async () => {
  const result=compareVideos(source,await loadVideo(delayed),options);
  assert.equal(result.events.matches.filter(x=>x.status==='shifted').length,4);
  assert.ok(result.events.matches.every(x=>x.offsetMs===100));
  assert.ok(result.comparison.framesAboveThreshold>0);
});
await test('ROI bounds and invalid thresholds are rejected',() => {
  assert.throws(()=>inspectVideo(source,{...options,roi:[0,53,96,14]}),/범위/);
  const result=invoke(['reference','inspect',original,'--out',path.join(dir,'bad-threshold'),'--cut-threshold','NaN']);
  assert.equal(result.status,1);
  assert.equal(fs.existsSync(path.join(dir,'bad-threshold')),false);
});
await test('fractional fps is preserved as an exact ratio',async () => {
  const video=await loadVideo(fixture('ntsc.mp4',{fps:'30000/1001',count:90}));
  assert.equal(video.metadata.fps.numerator/video.metadata.fps.denominator,30000/1001);
  assert.equal(video.metadata.frameCount,90);
  assert.equal(video.metadata.variableFrameRate,false);
});
await test('variable fps is measured using presentation timestamps',async () => {
  const video=await loadVideo(fixture('vfr.mp4',{count:20,filter:'setpts=if(lt(N\\,10)\\,N\\,10+2*(N-10))/(10*TB)'}));
  assert.equal(video.metadata.variableFrameRate,true);
  assert.equal(video.metadata.frames[11].seconds,1.2);
});
await test('rotation metadata uses displayed dimensions and preserves frame count',async () => {
  const file=path.join(dir,'rotated.mp4');
  ffmpeg(['-display_rotation','90','-i',original,'-c','copy',file]);
  const video=await loadVideo(file);
  assert.equal(video.metadata.width,54);
  assert.equal(video.metadata.height,96);
  assert.equal(Math.abs(video.metadata.rotation),90);
  assert.equal(video.metadata.frameCount,40);
  assert.doesNotThrow(()=>inspectVideo(video,{...options,roi:[0,80,54,16]}));
});
await test('added and missing cuts are reported alongside shorter renders',async () => {
  const short=await loadVideo(fixture('short.mp4',{count:15}));
  const missing=compareVideos(source,short,options);
  assert.ok(missing.findings.some(x=>x.type==='duration'&&x.value===-2500));
  assert.ok(missing.events.missing.some(x=>x.type==='cut'&&x.frame===30));
  const extra=compareVideos(short,source,options);
  assert.ok(extra.events.extra.some(x=>x.type==='cut'&&x.frame===30));
});
await test('strict CLI writes a report and returns quality failure for a mismatch',() => {
  const out=path.join(dir,'comparison');
  const result=invoke(['reference','compare',original,delayed,'--roi','0,40,96,14','--out',out,'--strict']);
  assert.equal(result.status,4,result.stderr);
  const report=JSON.parse(fs.readFileSync(path.join(out,'comparison.json'),'utf8'));
  assert.ok(report.findings.length);
  assert.ok(fs.readFileSync(path.join(out,'comparison.html'),'utf8').includes('data:image/bmp;base64,'));
});
await test('existing output and original media survive a repeated command',() => {
  const out=path.join(dir,'comparison');
  const before=fs.readFileSync(path.join(out,'comparison.json'));
  const result=invoke(['reference','inspect',original,'--out',out]);
  assert.equal(result.status,1);
  assert.deepEqual(fs.readFileSync(path.join(out,'comparison.json')),before);
  assert.equal(fs.existsSync(original),true);
});
await test('inline output paths retain equals signs and spaces',() => {
  const out=path.join(dir,'검수 = 결과');
  const result=invoke(['reference','inspect',original,'--out='+out]);
  assert.equal(result.status,0,result.stderr);
  assert.ok(fs.existsSync(path.join(out,'reference.html')));
});
await test('plan is accepted by film check and SRT text remains editable',() => {
  const srt=path.join(dir,'한글.srt');
  fs.writeFileSync(srt,'1\n00:00:00,200 --> 00:00:01,200\n첫 자막 <script>alert(1)</script>\n\n2\n00:00:02,000 --> 00:00:02,800\n두 번째 자막\n');
  const out=path.join(dir,'plan');
  const result=invoke(['reference','plan',original,'--out',out,'--srt',srt]);
  assert.equal(result.status,0,result.stderr);
  const check=checkFilmPlan(out);
  assert.equal(check.ok,true,JSON.stringify(check));
  const record=JSON.parse(fs.readFileSync(path.join(out,'reference.json'),'utf8'));
  assert.equal(record.captions[0].startFrame,2);
  assert.equal(record.captions[0].endFrameExclusive,12);
  assert.ok(fs.readFileSync(path.join(out,'scenes/shot-001.html'),'utf8').includes('첫 자막 \\u003cscript>'));
  assert.ok(fs.readFileSync(path.join(out,'scenes/shot-002.html'),'utf8').includes('첫 자막'));
});
await test('HTML reports escape source names and caption text',() => {
  const result=inspectVideo(source,options);
  result.source={...result.source,name:'<script>alert(1)</script>.mp4'};
  result.captions=[{text:'<img src=x onerror=alert(1)>',startFrame:2,endFrameExclusive:3,startSeconds:.2}];
  const html=inspectionReport(result,source);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;script&gt;'));
});
await test('audio delay is estimated with an explicit resolution',async () => {
  const audio=path.join(dir,'audio.mp4'),shifted=path.join(dir,'audio-shifted.mp4');
  const expression='0.5*sin(2*PI*750*t)*(between(t,0.2,0.31)+between(t,0.8,0.99)+between(t,1.4,1.51)+between(t,2.2,2.46))';
  const generate=(out,delay)=>ffmpeg(['-i',original,'-f','lavfi','-i','aevalsrc='+expression.replaceAll(',', '\\,')+':s=16000:d=4',
    '-map','0:v','-map','1:a','-af',delay,'-c:v','copy','-c:a','aac','-t','4',out]);
  generate(audio,'anull'); generate(shifted,'adelay=200:all=1');
  const result=compareVideos(await loadVideo(audio),await loadVideo(shifted),options);
  assert.equal(result.audio.status,'estimated',JSON.stringify(result.audio));
  assert.ok(Math.abs(result.audio.offsetMs-200)<=20,JSON.stringify(result.audio));
  assert.equal(result.audio.resolutionMs,20);
});
await test('missing, added and ambiguous audio have explicit results',async () => {
  const audio=await loadVideo(path.join(dir,'audio.mp4'));
  assert.equal(compareVideos(audio,source,options).audio.status,'missing-audio');
  assert.equal(compareVideos(source,audio,options).audio.status,'extra-audio');
  const file=path.join(dir,'silence.mp4');
  ffmpeg(['-i',original,'-f','lavfi','-i','anullsrc=r=8000:cl=mono','-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-t','4',file]);
  const silence=await loadVideo(file);
  assert.equal(compareVideos(silence,silence,options).audio.status,'uncertain');
});
await test('missing dependency has the documented exit code and creates no output',() => {
  const result=invoke(['reference','inspect',original,'--out',path.join(dir,'missing-tool')],{env:{...process.env,PATH:path.join(dir,'empty-path')}});
  assert.equal(result.status,5,result.stderr);
  assert.equal(fs.existsSync(path.join(dir,'missing-tool')),false);
});
await test('network URLs and unsupported commands are rejected before decoding',() => {
  const result=invoke(['reference','inspect','https://example.com/a.mp4','--out',path.join(dir,'network')]);
  assert.equal(result.status,1);
  assert.equal(fs.existsSync(path.join(dir,'network')),false);
});
const record=path.join(root,'tests/reference-result.json');
fs.writeFileSync(record,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
process.exitCode=evidence.failures.length?1:0;
