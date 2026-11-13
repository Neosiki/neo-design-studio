import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const VENDOR=path.resolve(HERE,'../vendor');
export function checkNode(version=process.versions.node){
  const [major,minor]=version.split('.').map(Number);
  if(major<22 || (major===22 && minor<18)) throw new Error('Node 22.18 이상이 필요합니다.');
}
export function findChrome(env=process.env, exists=fs.existsSync){
  if(env.CHROME){if(!exists(env.CHROME)) throw new Error('CHROME 경로에 실행 파일이 없습니다.');return env.CHROME;}
  const paths=[
    env.PROGRAMFILES && path.join(env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe'),
    env['PROGRAMFILES(X86)'] && path.join(env['PROGRAMFILES(X86)'],'Google/Chrome/Application/chrome.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'];
  const hit=paths.filter(Boolean).find(exists);
  if(!hit) throw new Error('Chrome을 찾지 못했습니다. CHROME에 실제 경로를 지정하세요.');
  return hit;
}
function positive(value,label){const n=Number(value);if(!Number.isSafeInteger(n)||n<=0)throw new Error(`${label}: 양의 정수가 필요합니다.`);return n;}
export function captureOptions(args,render=false){
  const [address,out,count,fpsArg,wArg='1920',hArg='1080',video]=args;
  if(!address||!out||!count||!fpsArg||(render&&!video))throw new Error('URL 출력폴더 프레임수 fps [폭 높이] [MP4경로]를 지정하세요.');
  const url=new URL(address);
  if(!['http:','https:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('로컬 HTTP/HTTPS 개발 서버만 캡처합니다.');
  if(!url.searchParams.has('debug'))throw new Error('URL에 ?debug가 필요합니다.');
  const frames=positive(count,'frames'),fps=positive(fpsArg,'fps'),width=positive(wArg,'width'),height=positive(hArg,'height');
  if(![15,30,60].includes(fps))throw new Error('1/60초 스텝을 보존하는 15·30·60fps만 지원합니다.');
  if(width%2||height%2)throw new Error('폭과 높이는 짝수여야 합니다.');
  return {url:url.href,out:path.resolve(out),frames,fps,width,height,video:video?path.resolve(video):undefined};
}
export function initProject(dir){
  if(!dir)throw new Error('새 프로젝트 폴더를 지정하세요.');
  const dest=path.resolve(dir);
  if(fs.existsSync(dest))throw new Error('기존 폴더에는 쓰지 않습니다. 새 경로를 지정하세요.');
  fs.cpSync(VENDOR,dest,{recursive:true,errorOnExist:true,force:false});
  return dest;
}
function run(exe,args,options={}){
  const p=spawnSync(exe,args,{windowsHide:true,encoding:'utf8',maxBuffer:16*1024*1024,...options});
  if(p.error)throw p.error;
  if(p.status!==0)throw new Error(`${path.basename(exe)} 실패 (${p.status}): ${(p.stderr||p.stdout||'').slice(-4000)}`);
  return p.stdout;
}
export function doctor(){
  const checks={node:process.versions.node};
  for(const [key,fn] of Object.entries({runtime:()=>{checkNode();return 'ok';},chrome:()=>findChrome(),ffmpeg:()=>run(process.env.FFMPEG||'ffmpeg',['-version']).split('\n')[0],ffprobe:()=>run(process.env.FFPROBE||'ffprobe',['-version']).split('\n')[0]})){
    try{checks[key]=fn();}catch(e){checks[key]={error:e.message};}
  }
  return {ok:!Object.values(checks).some(v=>v&&typeof v==='object'&&v.error),checks};
}
export function capture(opts,render=false){
  checkNode(); const chrome=findChrome();
  if(fs.existsSync(opts.out))throw new Error('기존 프레임 폴더는 덮어쓰지 않습니다.');
  if(render&&fs.existsSync(opts.video))throw new Error('기존 MP4는 덮어쓰지 않습니다.');
  if(render){run(process.env.FFMPEG||'ffmpeg',['-version']);run(process.env.FFPROBE||'ffprobe',['-version']);}
  run(process.execPath,[path.join(VENDOR,'scripts/capture.ts'),opts.url,opts.out,String(opts.frames),String(opts.fps),String(opts.width),String(opts.height)],{env:{...process.env,CHROME:chrome},timeout:Math.max(60000,opts.frames*5000)});
  for(let i=0;i<opts.frames;i++){
    const p=path.join(opts.out,`f${String(i).padStart(4,'0')}.png`);
    if(!fs.existsSync(p)||fs.statSync(p).size<100)throw new Error(`프레임 누락: ${i}`);
  }
  const report={frames:opts.frames,fps:opts.fps,width:opts.width,height:opts.height,duration:opts.frames/opts.fps,out:opts.out};
  if(render){
    fs.mkdirSync(path.dirname(opts.video),{recursive:true});
    run(process.env.FFMPEG||'ffmpeg',['-v','error','-n','-framerate',String(opts.fps),'-i',path.join(opts.out,'f%04d.png'),'-c:v','libx264','-preset','slow','-crf','15','-pix_fmt','yuv420p','-movflags','+faststart','-tune','animation',opts.video]);
    const probe=JSON.parse(run(process.env.FFPROBE||'ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,nb_read_frames,duration','-of','json',opts.video]));
    const stream=probe.streams?.[0];
    if(!stream||stream.width!==opts.width||stream.height!==opts.height||Number(stream.nb_read_frames)!==opts.frames||!Number.isFinite(Number(stream.duration))||Math.abs(Number(stream.duration)-report.duration)>1/opts.fps)throw new Error('출력 영상의 해상도·프레임 수·길이가 일치하지 않습니다.');
    report.video=opts.video; report.probe=stream;
  }
  fs.writeFileSync(path.join(opts.out,'capture-report.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}
export function main(args){
  const [cmd,...rest]=args;
  if(!cmd||cmd==='help'||cmd==='--help')return 'line-art: doctor | init <new-dir> | capture|render <local-url?debug> <new-frames-dir> <frames> <15|30|60> [width height] [new.mp4]';
  if(cmd==='doctor')return doctor();
  if(cmd==='init')return {project:initProject(rest[0])};
  if(cmd==='capture'||cmd==='render')return capture(captureOptions(rest,cmd==='render'),cmd==='render');
  throw new Error('알 수 없는 명령입니다. --help를 확인하세요.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{const result=main(process.argv.slice(2));console.log(typeof result==='string'?result:JSON.stringify(result,null,2));if(result?.ok===false)process.exitCode=1;}
  catch(e){console.error(e.message);process.exitCode=1;}
}
