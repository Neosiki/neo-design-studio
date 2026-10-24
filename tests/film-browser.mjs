import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { scaffoldFilm } from '../scripts/design/lib/film/plan.mjs';
import { inspectFilm, compareProtection, compareTimeline, comparePixels, sampleTimes, shuffledIndices, localFile, sampleFilm } from '../scripts/design/lib/film/browser.mjs';

function cleanup(dir) {
  const tmp = fs.realpathSync(os.tmpdir()), absolute = path.resolve(dir);
  if (!absolute.startsWith(tmp + path.sep) || !path.basename(dir).startsWith('neodesign-film-')) throw new Error('Refusing cleanup outside the test fixture.');
  fs.rmSync(absolute,{recursive:true,force:true});
}

export function run(test, assert) {
  test('film protection retains locked tracks and accepts unrelated additions', () => {
    const b = {schemaVersion:'1.0',lockedTracks:[{key:'id:voice',html:'<section locked></section>'}],edits:[{key:'title',size:'1920x1080',overrides:[{at:'#title',text:'사용자 제목'}]}]};
    assert(compareProtection(b,structuredClone(b)).length===0,'Same protection must pass.');
    const c = structuredClone(b); c.edits.push({key:'new',size:'640x360'});
    assert(compareProtection(b,c).length===0,'New clips must remain editable.');
  });
  test('film protection catches manual text/size removal and locked-track changes', () => {
    const b = {schemaVersion:'1.0',lockedTracks:[{key:'id:voice',html:'original'}],edits:[{key:'title',size:'1920x1080',overrides:[{text:'keep'}]}]};
    for (const mutate of [c=>{c.edits=[];},c=>{delete c.edits[0].size;},c=>{c.edits[0].overrides[0].text='lost';},c=>{c.lockedTracks[0].html='changed';}]) {
      const c=structuredClone(b); mutate(c); assert(compareProtection(b,c).length>0,'Lost protected edit was accepted.');
    }
  });
  test('film protection rejects an invalid baseline', () => assert(compareProtection({},{}).length===1,'Invalid baseline passed.'));
  test('film protection catches moving a locked track in the stacking order', () => {
    const b={schemaVersion:'1.0',lockedTracks:[{key:'id:user',index:0,html:'same'}],edits:[]};
    const c=structuredClone(b); c.lockedTracks[0].index=1;
    assert(compareProtection(b,c).length===1,'Locked track order changed without notice.');
  });
  test('film timeline comparison catches source and duration drift while allowing trimmed pages', () => {
    const p={shots:[{id:'title',page:'scenes\\title.html',duration:4}]};
    const clips=[{id:'title',tag:'IFRAME',src:'scenes/title.html#t=2,6'}];
    const good=compareTimeline(p,clips); assert(!good.errors.length && good.starts.title===2,'Valid source fragment rejected.');
    for(const src of ['scenes/other.html#t=2,6','scenes/title.html#t=2,5','scenes/title.html#bad']) assert(compareTimeline(p,[{...clips[0],src}]).errors.length,'Timeline drift was accepted.');
    assert(compareTimeline(p,[]).errors.length,'Missing planned iframe accepted.');
  });
  test('film pixel comparison tolerates minor raster noise and rejects visible movement', () => {
    const a=Buffer.alloc(40000,128), b=Buffer.from(a); b[0]+=2;
    assert(comparePixels(a,b).ok,'Tiny raster noise rejected.');
    b.fill(240,0,400); assert(!comparePixels(a,b).ok,'Visible change accepted.');
    assert(!comparePixels(a,Buffer.alloc(4)).ok,'Wrong size accepted.');
  });
  test('film sample timing includes the first frame and stays below the end', () => {
    const times=sampleTimes(4); assert(times.length===12 && times[0]===0 && times.at(-1)<4 && times.at(-1)>3.99,'Bad timing.');
    const a=shuffledIndices(12,273819),b=shuffledIndices(12,918273);
    assert(new Set(a).size===12 && JSON.stringify(a)!==JSON.stringify(b),'Orders must cover all samples and differ.');
    let rejected=false; try {sampleTimes(0);} catch {rejected=true;} assert(rejected,'Invalid duration passed.');
  });
  test('film browser server resolver rejects traversal and non-files', () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'neodesign-film-unit-'));
    try { fs.writeFileSync(path.join(dir,'ok.html'),'ok'); assert(localFile(dir,'ok.html').endsWith('ok.html'),'Safe file rejected.');
      for (const p of ['../outside','C:/outside','https://example.com','.', '..\\outside']) {let rejected=false; try{localFile(dir,p);}catch{rejected=true;} assert(rejected,`Unsafe path accepted: ${p}`);}
    } finally {cleanup(dir);}
  });
}

export async function runRuntime(test, assert) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const cli = path.join(root,'scripts/design/cli.mjs');
  async function fixture(fn) {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'neodesign-film-browser-'));
    try {scaffoldFilm(dir); await fn(dir);} finally {cleanup(dir);}
  }
  await test('film browser extracts and protects actual Studio overrides and locked tracks', () => fixture(async dir => {
    const file=path.join(dir,'film.html');
    fs.writeFileSync(file,`<!doctype html><html><body><section id="user-track" locked><iframe id="title" src="scenes/title.html#t=0,4" size="1920x1080" overrides='[{"at":"#title","text":"사용자가 고침"}]'></iframe></section></body></html>`);
    const first=await inspectFilm(dir); assert(!first.errors.length,'Valid film rejected.');
    fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('사용자가 고침','AI가 덮어씀'));
    const next=await inspectFilm(dir);
    assert(compareProtection(first.protection,next.protection).length===2,'Text and locked track damage were not caught.');
  }));
  await test('film sample produces twelve frames and contact sheet from the real browser', () => fixture(async dir => {
    const report=await sampleFilm(dir,{out:path.join(dir,'review')});
    assert(report.ok,JSON.stringify(report.errors));
    assert(report.shots[0].frameHashes.length===12 && report.shots[0].times.length===12,'Expected twelve browser samples.');
    assert(new Set(report.shots[0].frameHashes).size>1,'Scene did not move.');
    assert(fs.existsSync(path.join(report.out,'title-contact-sheet.png')) && fs.existsSync(path.join(report.out,'film-sample-report.json')),'Review artifacts missing.');
    let refused=false; try {await sampleFilm(dir,{out:report.out});} catch {refused=true;} assert(refused,'Existing report was overwritten.');
  }));
  await test('film sample catches stateful drawing when frame order changes', () => fixture(async dir => {
    fs.writeFileSync(path.join(dir,'scenes/title.html'),`<html><body style="margin:0"><div id="box" style="position:absolute;width:200px;height:200px;background:red"></div><script>let x=0;window.film={duration:4,frame(t){x+=25;document.getElementById('box').style.left=x+'px';}};</script></body></html>`);
    const r=await sampleFilm(dir,{out:path.join(dir,'review'),count:3});
    assert(!r.ok && r.errors.some(x=>x.check==='film.orderDependent'),'Stateful frame was accepted.');
  }));
  await test('film sample respects paused Web Animations seeks and Windows relative paths', () => fixture(async dir => {
    const p=path.join(dir,'film-plan.json'), plan=JSON.parse(fs.readFileSync(p,'utf8')); plan.shots[0].page='scenes\\title.html'; fs.writeFileSync(p,JSON.stringify(plan));
    fs.writeFileSync(path.join(dir,'scenes/title.html'),`<html><body style="margin:0"><div id="box" style="width:200px;height:200px;background:red"></div><script>const a=document.querySelector('#box').animate([{transform:'translateX(0px)'},{transform:'translateX(600px)'}],{duration:4000,fill:'both'});a.pause();window.film={duration:4,frame(t){a.currentTime=t*1000}};</script></body></html>`);
    const r=await sampleFilm(dir,{out:path.join(dir,'review'),count:3});
    assert(r.ok,JSON.stringify(r.errors)); assert(new Set(r.shots[0].frameHashes).size===3,'Seeked animation was forced to its end.');
  }));
  await test('film sample refuses a plan that differs from the edit document', () => fixture(async dir => {
    const f=path.join(dir,'film.html'); fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('#t=0,4','#t=0,3'));
    const r=await sampleFilm(dir,{out:path.join(dir,'review'),count:2});
    assert(!r.ok && r.errors.some(x=>x.check==='film.timeline.duration'),'Wrong edit duration accepted.');
  }));
  await test('film sampler sets filmHost before a page chooses its standalone playback loop', () => fixture(async dir => {
    fs.writeFileSync(path.join(dir,'scenes/title.html'),`<html><body><script>window.film={duration:4,frame(t){document.body.style.background=t<2?'red':'blue';}};if(!window.filmHost){throw new Error('standalone loop started');}</script></body></html>`);
    const r=await sampleFilm(dir,{out:path.join(dir,'review'),count:2});
    assert(r.ok,JSON.stringify(r.errors));
  }));
  await test('film sample blocks external requests and returns a failed report', () => fixture(async dir => {
    fs.writeFileSync(path.join(dir,'scenes/title.html'),`<html><body><img src="https://example.invalid/private"><script>window.film={duration:4,frame(t){document.body.style.background='white'}};</script></body></html>`);
    const r=await sampleFilm(dir,{out:path.join(dir,'review'),count:2});
    assert(!r.ok && r.errors.some(x=>x.check==='film.externalRequest'),'External request was accepted.');
  }));
  await test('film browser rejects scripts in the edit document and CLI check preserves exit codes', () => fixture(async dir => {
    fs.appendFileSync(path.join(dir,'film.html'),'<script>window.shouldNotRun=true</script>');
    const inspected=await inspectFilm(dir); assert(inspected.errors.some(x=>x.check==='film.script'),'Edit script accepted.');
    const pending=spawnSync(process.execPath,[cli,'film','check','--dir',dir,'--strict'],{encoding:'utf8'});
    assert(pending.status===4,`Strict pending review code=${pending.status}`);
    const unknown=spawnSync(process.execPath,[cli,'film','unknown'],{encoding:'utf8'}); assert(unknown.status===1,'Unknown action must be usage error.');
  }));
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  let passed=0,failed=0;
  const assert=(ok,msg)=>{if(!ok) throw new Error(msg);};
  const test=async(name,fn)=>{try{await fn();passed++;console.log(`ok ${name}`);}catch(e){failed++;console.error(`FAIL ${name}: ${e.stack}`);}};
  await runRuntime(test,assert);
  console.log(`${passed} passed / ${failed} failed`); process.exitCode=failed?1:0;
}
