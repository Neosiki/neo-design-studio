import fs from 'node:fs';
import path from 'node:path';
import { scaffoldFilm, checkFilmPlan } from './plan.mjs';
import { inspectFilm, compareProtection, compareTimeline, sampleFilm } from './browser.mjs';

export async function filmCommand(args) {
  const action = args.positional[0] || 'help';
  const dir = path.resolve(args.flags.dir || '.');
  if (action === 'help') {
    console.log(`design film — 선택형 OpenFilm 제작 준비 (NeoDesign 2026.10.0)
  init      --dir <폴더>       film.html·샷 페이지·film-plan.json 생성 (덮어쓰기 없음)
  check     --dir <폴더>       샷·캐릭터·출처·자산 해시 검사
              --strict 경고도 실패 / --baseline <보호스냅샷.json> 편집 보존 비교
  snapshot  --dir <폴더> --out <새파일.json>   locked 트랙·overrides·size 보호 기준
  sample    --dir <폴더> [--out <빈폴더>]     샷별 12표본 두 순서·PNG 접촉시트

snapshot/sample 및 --baseline은 Playwright·Chromium·sharp가 필요합니다.
sample은 독립 샷 검수입니다. OpenFilm 합성·오디오·MP4 렌더 통과를 뜻하지 않습니다.
가이드: references/openfilm-backend.md`);
    return 0;
  }
  if (action === 'init') { console.log(JSON.stringify(scaffoldFilm(dir),null,2)); return 0; }
  if (!['check','snapshot','sample'].includes(action)) { console.error(`알 수 없는 film 명령: ${action}`); return 1; }
  if (action === 'snapshot') {
    if (!args.flags.out || args.flags.out === true) { console.error('snapshot에는 --out <새파일.json>이 필요합니다.'); return 1; }
    const out = path.resolve(args.flags.out);
    if (fs.existsSync(out)) { console.error(`보호 기준을 덮어쓰지 않습니다: ${out}`); return 1; }
    const state = await inspectFilm(dir);
    if (state.errors.length) { console.log(JSON.stringify(state,null,2)); return 4; }
    fs.mkdirSync(path.dirname(out),{recursive:true});
    fs.writeFileSync(out,JSON.stringify(state.protection,null,2)+'\n',{flag:'wx'});
    console.log(`사용자 편집 보호 기준 저장: ${out}`);
    return 0;
  }
  const report = checkFilmPlan(dir);
  if (action === 'check' && args.flags.baseline) {
    const state = await inspectFilm(dir);
    report.errors.push(...state.errors, ...compareProtection(JSON.parse(fs.readFileSync(path.resolve(args.flags.baseline),'utf8')),state.protection));
    if (report.ok) {
      const timeline = compareTimeline(JSON.parse(fs.readFileSync(path.join(dir,'film-plan.json'),'utf8')),state.clips);
      report.errors.push(...timeline.errors); report.warnings.push(...timeline.warnings);
    }
    report.ok = report.errors.length === 0;
  }
  if (action === 'sample' && report.ok) {
    const result = await sampleFilm(dir,{out:args.flags.out});
    console.log(JSON.stringify(result,null,2));
    return result.ok ? 0 : 4;
  }
  console.log(JSON.stringify(report,null,2));
  return !report.ok || (args.flags.strict && report.warnings.length) ? 4 : 0;
}
