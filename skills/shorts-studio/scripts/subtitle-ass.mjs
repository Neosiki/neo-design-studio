#!/usr/bin/env node
/**
 * subtitle-ass.mjs · timeline.json → ASS 자막 (한국어 카라오케 / 팝인 / 박스 프리셋, 9:16 안전 영역 반영)
 *
 * 사용법:
 *   node skills/shorts-studio/scripts/subtitle-ass.mjs --timeline _shorts/timeline.json --out _shorts/subs.ass --preset karaoke
 *   node skills/shorts-studio/scripts/subtitle-ass.mjs --timeline t.json --out s.ass --preset pop --font "Malgun Gothic" --title "열두달사진관"
 *
 * 옵션:
 *   --preset karaoke|pop|box   기본 karaoke (낱말이 읽히는 순서대로 색이 채워짐)
 *   --size 1080x1920           기본 1080x1920 (가로 영상은 1920x1080)
 *   --font <이름>              기본 "Malgun Gothic"(Windows). Mac은 "Apple SD Gothic Neo", 리눅스는 "Noto Sans CJK KR"
 *   --font-size <px>           기본 세로 72 / 가로 56
 *   --max-chars <n>            한 줄 최대 글자 수, 기본 세로 11 / 가로 22
 *   --title <문구>             상단 제목 띠(전 구간). 안전 영역 안쪽에 둡니다
 *   --hl <RRGGBB> --em <RRGGBB> 읽히는 색(기본 FFE14D) / 강조 낱말색(기본 FF6B6B)
 *
 * 안전 영역(1080x1920 기준): 위 150px, 아래 420px, 오른쪽 140px은 비웁니다(플랫폼 UI가 덮는 구간).
 * 자막 번인: ffmpeg -i in.mp4 -vf "ass=subs.ass:fontsdir=<폰트폴더>" out.mp4
 */
import fs from 'node:fs';

function parseArgs(argv) {
  const a = { preset: 'karaoke', size: '1080x1920', hl: 'FFE14D', em: 'FF6B6B', font: 'Malgun Gothic' };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === '--timeline') a.timeline = v(); else if (k === '--out') a.out = v(); else if (k === '--preset') a.preset = v();
    else if (k === '--size') a.size = v(); else if (k === '--font') a.font = v(); else if (k === '--font-size') a.fontSize = +v();
    else if (k === '--max-chars') a.maxChars = +v(); else if (k === '--title') a.title = v(); else if (k === '--hl') a.hl = v(); else if (k === '--em') a.em = v();
  }
  return a;
}

const bgr = (rgb) => rgb.slice(4, 6) + rgb.slice(2, 4) + rgb.slice(0, 2); // ASS는 BBGGRR
const clock = (s) => { const cs = Math.round(s * 100); const h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, sec = Math.floor(cs / 100) % 60; return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`; };
const esc = (t) => t.replace(/\\/g, '＼').replace(/[{}]/g, '');

/** 낱말들을 줄(≤maxChars)과 쪽(≤2줄)으로 묶는다. 낱말은 자르지 않고, 마지막 쪽이 짧은 한 줄이면 앞 쪽에 붙인다. */
export function paginate(words, maxChars, maxLines = 2) {
  const pages = []; let lines = [[]], len = 0;
  const flush = () => { if (lines[0].length) pages.push({ lines, words: lines.flat() }); lines = [[]]; len = 0; };
  for (const w of words) {
    const n = w.text.length;
    if (lines[lines.length - 1].length && len + 1 + n > maxChars) {
      if (lines.length >= maxLines) flush(); else { lines.push([]); len = 0; }
    }
    const cur = lines[lines.length - 1];
    len += (cur.length ? 1 : 0) + n; cur.push(w);
  }
  flush();
  const n = pages.length;
  if (n > 1) {
    const last = pages[n - 1], prev = pages[n - 2];
    const lastLen = last.words.map((w) => w.text).join(' ').length;
    if (last.lines.length === 1 && lastLen < maxChars * 0.55 && prev.lines.length < maxLines + 1) {
      prev.lines = [...prev.lines, ...last.lines]; prev.words = prev.lines.flat(); pages.pop();
    }
  }
  return pages;
}

export function buildAss(timeline, o) {
  const [W, H] = o.size.split('x').map(Number);
  const vertical = H > W;
  const fs_ = o.fontSize || (vertical ? 72 : 56);
  const maxChars = o.maxChars || (vertical ? 11 : 22);
  const marginV = vertical ? Math.round(H * 0.22) : Math.round(H * 0.08); // 아래 안전 영역
  const marginLR = vertical ? 140 : 80;
  const hl = bgr(o.hl), em = bgr(o.em), white = 'FFFFFF';
  const box = o.preset === 'box';
  const style = (name, primary, secondary, extra = '') =>
    `Style: ${name},${o.font},${fs_},&H00${primary},&H00${secondary},&H00101010,&H${box ? '99' : '00'}000000,-1,0,0,0,100,100,0,0,${box ? 3 : 1},${box ? 14 : 6},${box ? 0 : 2},2,${marginLR},${marginLR},${marginV},1${extra}`;
  const titleStyle = `Style: Title,${o.font},${Math.round(fs_ * 0.62)},&H00${white},&H00${white},&H00101010,&H99000000,-1,0,0,0,100,100,0,0,3,10,0,8,${marginLR},${marginLR},${vertical ? Math.round(H * 0.085) : 30},1`;
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n` +
    `[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n` +
    // karaoke: Primary=읽힌 색, Secondary=읽히기 전 색. pop/box는 한 색
    `${style('Main', o.preset === 'karaoke' ? hl : white, white)}\n${titleStyle}\n` +
    `\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
  const ev = [];
  const pagesOut = [];
  const lastEnd = timeline.totalDuration;
  if (o.title) ev.push(`Dialogue: 0,${clock(0)},${clock(lastEnd)},Title,,0,0,0,,${esc(o.title)}`);

  for (const sc of timeline.scenes) for (const ch of sc.chunks) {
    const words = (ch.words || []).map((w) => ({ ...w, s: w.absoluteStart ?? w.start, e: w.absoluteEnd ?? w.end }));
    for (const pg of paginate(words, maxChars)) {
      const ps = pg.words[0].s, pe = Math.min(pg.words[pg.words.length - 1].e + 0.15, lastEnd);
      let text = '', prevEnd = ps;
      pg.lines.forEach((ln, li) => {
        if (li) text += '\\N';
        ln.forEach((w, wi) => {
          const sp = wi ? ' ' : '';
          const dur = Math.max(1, Math.round((w.e - w.s) * 100));
          const gapCs = Math.round((w.s - prevEnd) * 100); prevEnd = w.e;
          const gapTag = o.preset === 'karaoke' && gapCs > 2 ? `{\\k${gapCs}}` : '';
          if (o.preset === 'karaoke') text += `${sp}${gapTag}{\\kf${dur}\\1c&H${w.em ? em : hl}&}${esc(w.text)}`;
          else text += `${sp}${w.em ? `{\\1c&H${em}&}` : ''}${esc(w.text)}${w.em ? '{\\1c&HFFFFFF&}' : ''}`;
        });
      });
      const anim = o.preset === 'pop' ? '{\\fscx85\\fscy85\\t(0,140,\\fscx100\\fscy100)\\fad(60,60)}' : (o.preset === 'box' ? '{\\fad(80,80)}' : '{\\fad(50,50)}');
      pagesOut.push({ ps, pe, line: anim + text });
    }
  }
  pagesOut.forEach((p, i) => { const nx = pagesOut[i + 1]; const end = nx ? Math.min(p.pe, nx.ps - 0.02) : p.pe; ev.push(`Dialogue: 1,${clock(p.ps)},${clock(Math.max(end, p.ps + 0.1))},Main,,0,0,0,,${p.line}`); });
  return header + ev.join('\n') + '\n';
}

function main() {
  const a = parseArgs(process.argv);
  if (!a.timeline || !a.out) { console.error('사용법: subtitle-ass.mjs --timeline timeline.json --out subs.ass [--preset karaoke|pop|box] [--size 1080x1920] [--font ...] [--title ...]'); process.exit(1); }
  if (!['karaoke', 'pop', 'box'].includes(a.preset)) { console.error('preset은 karaoke, pop, box 중 하나입니다.'); process.exit(1); }
  const tl = JSON.parse(fs.readFileSync(a.timeline, 'utf8'));
  fs.writeFileSync(a.out, buildAss(tl, a), 'utf8');
  console.log(`ASS 생성: ${a.out} (preset=${a.preset}, ${a.size})`);
}
if (process.argv[1]?.endsWith('subtitle-ass.mjs')) main();
