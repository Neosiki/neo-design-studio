import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkNode,findChrome,captureOptions,initProject,main } from '../skills/line-art-animation/scripts/line-art.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('supported and unsupported Node runtimes',()=>{checkNode('22.18.0');checkNode('24.0.0');assert.throws(()=>checkNode('22.17.0'));assert.throws(()=>checkNode('20.20.0'));});
test('Windows Chrome location and explicit override',()=>{const env={PROGRAMFILES:'C:/Program Files'};assert.match(findChrome(env,p=>p.includes('Google')),/chrome.exe$/);assert.equal(findChrome({CHROME:'custom'},p=>p==='custom'),'custom');assert.throws(()=>findChrome({CHROME:'missing'},()=>false));});
test('30fps yields requested duration, Unicode path retained',()=>{const o=captureOptions(['http://127.0.0.1:5173/?debug','임시 출력','900','30']);assert.equal(o.frames/o.fps,30);assert.ok(o.out.endsWith('임시 출력'));});
test('reject time-step drift at 24fps',()=>assert.throws(()=>captureOptions(['http://localhost/?debug','tmp','60','24']),/15·30·60/));
test('reject fractional, negative and non-finite input',()=>{for(const n of ['0','-1','2.5','Infinity','NaN'])assert.throws(()=>captureOptions(['http://localhost/?debug','tmp',n,'30']));});
test('reject missing debug and non-local URLs',()=>{for(const u of ['http://localhost/','https://example.com/?debug','file:///tmp/a?debug'])assert.throws(()=>captureOptions([u,'tmp','60','30']));});
test('reject odd dimensions and absent render target',()=>{assert.throws(()=>captureOptions(['http://localhost/?debug','tmp','60','30','1919','1080']));assert.throws(()=>captureOptions(['http://localhost/?debug','tmp','60','30'],true));});
test('init preserves upstream license and examples without replacing files',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'neo-line-art-'));
 try{const dest=initProject(path.join(tmp,'한글 project'));assert.ok(fs.existsSync(path.join(dest,'lib/gait.ts')));assert.ok(fs.existsSync(path.join(dest,'examples/walker/walker.ts')));assert.match(fs.readFileSync(path.join(dest,'LICENSE'),'utf8'),/JDhruv14/);assert.throws(()=>initProject(dest),/기존/);}finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('optional routing retains other backends',()=>{const s=fs.readFileSync(path.join(root,'SKILL.md'),'utf8');for(const x of ['skills/line-art-animation/SKILL.md','HyperFrames','OpenFilm','whiteboard-video'])assert.ok(s.includes(x));});
test('init copies every vendor file byte-for-byte to a nested Unicode path',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'neo-line-art-copy-'));
  try{
    const parent=path.join(tmp,'한글 상위');fs.mkdirSync(parent);
    const dest=initProject(path.join(parent,'새 장면'));
    const source=path.join(root,'skills/line-art-animation/vendor');
    function compare(from,to){for(const entry of fs.readdirSync(from,{withFileTypes:true})){
      const a=path.join(from,entry.name),b=path.join(to,entry.name);
      if(entry.isDirectory())compare(a,b);else assert.deepEqual(fs.readFileSync(b),fs.readFileSync(a),entry.name);
    }}
    compare(source,dest);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('line-art metadata is scoped and source commit pinned',()=>{const d=JSON.parse(fs.readFileSync(path.join(root,'skills/line-art-animation/vendor/provenance.json'),'utf8'));assert.equal(d.commit,'c43d698913cf0ad44f984c7ae14c5348010594d3');assert.equal(d.license,'MIT');for(const [file,expected] of Object.entries(d.upstream_sha256)){let text=fs.readFileSync(path.join(root,'skills/line-art-animation/vendor',file),'utf8').replace(/\r\n/g,'\n');if(file==='scripts/capture.ts')text=text.replace("{ stdio: 'ignore', windowsHide: true }","{ stdio: 'ignore' }");assert.equal(crypto.createHash('sha256').update(text).digest('hex'),expected,file);}assert.ok(main(['--help']).includes('capture'));assert.throws(()=>main(['unknown']));});
