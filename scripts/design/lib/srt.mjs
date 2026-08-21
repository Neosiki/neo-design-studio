/**
 * srt.mjs — SRT 자막 파서
 *
 * 자막을 화면에 표시하려고 읽는 게 아니라, **영상의 장면 경계와 타이밍을 정하는 입력**으로 읽는다.
 * 그래서 관대해야 한다. 실무에서 들어오는 파일은 대체로 규격에서 조금씩 벗어나 있다.
 *
 * 다루는 변형
 *  - UTF-8 BOM, UTF-16 LE/BE BOM
 *  - CRLF · CR · LF 줄바꿈
 *  - 00:00:01,000 / 00:00:01.000 / 0:00:01,00 (밀리초 자리수 1~3)
 *  - 인덱스 번호 누락
 *  - 여러 줄 자막, 빈 자막, 겹치는 큐
 *  - WebVTT 헤더(WEBVTT)와 NOTE 블록 (덤으로)
 */

const TIME_LINE = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

/** BOM을 벗기고 텍스트로 만든다. Buffer도 문자열도 받는다. */
export function decodeSubtitleText(input) {
  if (typeof input === 'string') return input.replace(/^﻿/, '');
  const buf = Buffer.from(input);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le', 2);
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    // UTF-16 BE — 바이트를 뒤집어 LE로 읽는다
    const swapped = Buffer.allocUnsafe(buf.length - 2);
    for (let i = 2; i + 1 < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1];
      swapped[i - 1] = buf[i];
    }
    return swapped.toString('utf16le');
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.toString('utf8', 3);
  return buf.toString('utf8');
}

function toMs(h, m, s, frac) {
  const ms = Number(String(frac).padEnd(3, '0').slice(0, 3));
  return ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + ms;
}

/**
 * SRT/VTT 텍스트를 큐 배열로 만든다.
 * 반환: { cues: [{ index, startMs, endMs, text, lines }], warnings: [string] }
 */
export function parseSrt(input) {
  const text = decodeSubtitleText(input).replace(/\r\n?/g, '\n');
  const cues = [];
  const warnings = [];

  const blocks = text.split(/\n{2,}/);
  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (!block) continue;
    if (/^WEBVTT/i.test(block) && !TIME_LINE.test(block)) continue;
    if (/^NOTE\b/i.test(block)) continue;

    const lines = block.split('\n');
    const timeIdx = lines.findIndex((l) => TIME_LINE.test(l));
    if (timeIdx === -1) {
      warnings.push(`타임코드가 없는 블록을 건너뜁니다: "${block.slice(0, 30).replace(/\n/g, ' ')}…"`);
      continue;
    }

    const m = lines[timeIdx].match(TIME_LINE);
    const startMs = toMs(m[1], m[2], m[3], m[4]);
    const endMs = toMs(m[5], m[6], m[7], m[8]);

    const declaredIndex = timeIdx > 0 ? Number(lines[timeIdx - 1].trim()) : NaN;
    const body = lines.slice(timeIdx + 1).map((l) => l.trim()).filter(Boolean);

    if (endMs <= startMs) {
      warnings.push(`큐 ${cues.length + 1}: 끝이 시작보다 빠르거나 같습니다 (${startMs}→${endMs}ms). 건너뜁니다.`);
      continue;
    }
    if (body.length === 0) {
      warnings.push(`큐 ${cues.length + 1}: 본문이 비어 있습니다.`);
    }

    cues.push({
      index: Number.isFinite(declaredIndex) ? declaredIndex : cues.length + 1,
      startMs,
      endMs,
      lines: body,
      text: body.join(' '),
    });
  }

  cues.sort((a, b) => a.startMs - b.startMs);

  for (let i = 1; i < cues.length; i += 1) {
    if (cues[i].startMs < cues[i - 1].endMs) {
      warnings.push(
        `큐 ${i}와 ${i + 1}이 ${cues[i - 1].endMs - cues[i].startMs}ms 겹칩니다. 장면 경계 계산은 시작 시각을 기준으로 합니다.`
      );
    }
  }

  if (cues.length === 0) warnings.push('읽을 수 있는 자막 큐가 없습니다.');

  return { cues, warnings };
}

/* ── 언어 감지와 문장 경계 ──────────────────────────────────────── */

/**
 * 자막 언어를 추정한다. 장면 분할이 어느 규칙으로 문장을 끊을지 정하는 데만 쓴다.
 * 반환: 'ko' | 'zh' | 'ja' | 'en'
 */
export function detectLanguage(cues) {
  const sample = cues.map((c) => c.text).join(' ').slice(0, 4000);
  let hangul = 0;
  let kana = 0;
  let han = 0;
  let latin = 0;
  for (const ch of sample) {
    const code = ch.codePointAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) hangul += 1;
    else if ((code >= 0x3040 && code <= 0x309f) || (code >= 0x30a0 && code <= 0x30ff)) kana += 1;
    else if (code >= 0x4e00 && code <= 0x9fff) han += 1;
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) latin += 1;
  }
  if (hangul > 0 && hangul >= han && hangul >= kana) return 'ko';
  if (kana > 0 && kana >= han) return 'ja';
  if (han > 0 && han > latin / 4) return 'zh';
  return 'en';
}

/** 언어별 문장 종결 신호. 시간만으로 자르면 문장 한가운데서 장면이 바뀐다. */
const SENTENCE_END = {
  ko: /(?:[.!?…]|다|요|죠|까|네|군요|습니다|입니다|세요|십시오)\s*$/,
  ja: /(?:[。！？…]|ます|です|ました|でした|ません)\s*$/,
  zh: /[。！？…]\s*$/,
  en: /[.!?…]["')\]]?\s*$/,
};

/** 문장이 끝나는 자막인가 — 장면 경계 후보 판정 */
export function endsSentence(text, lang = 'en') {
  const t = String(text).trim();
  if (!t) return false;
  return (SENTENCE_END[lang] || SENTENCE_END.en).test(t);
}

/**
 * 접속·전환 신호로 시작하는 자막인가. 이런 자막 앞은 끊기 좋은 자리다.
 * (원본 저장소는 시간만 보고 잘랐다. 여기서 의미 보정을 더한다.)
 */
const TOPIC_SHIFT = {
  ko: /^(그런데|그러나|하지만|그래서|먼저|다음으로|이제|반면|한편|결국|정리하면|예를 들어|우선|마지막으로)/,
  ja: /^(しかし|でも|そして|\u6B21に|まず|\u4E00\u65B9|つまり|\u4F8Bえば|\u6700\u5F8Cに)/,
  zh: /^(하지만|그러나|그래서|우선|다음에|지금|다른 한편으로|요컨대|예를 들어|마지막으로)/,
  en: /^(But|However|So|First|Next|Now|Meanwhile|In contrast|Finally|For example|Then|Therefore)\b/i,
};

export function startsNewTopic(text, lang = 'en') {
  return (TOPIC_SHIFT[lang] || TOPIC_SHIFT.en).test(String(text).trim());
}

/** SRT 텍스트로 다시 쓴다 (장면 계획을 편집한 뒤 자막 트랙을 재생성할 때). */
export function formatSrt(cues) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const stamp = (ms) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
  };
  return `${cues
    .map((cue, i) => `${i + 1}\n${stamp(cue.startMs)} --> ${stamp(cue.endMs)}\n${(cue.lines || [cue.text]).join('\n')}`)
    .join('\n\n')}\n`;
}
