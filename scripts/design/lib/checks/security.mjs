/**
 * security.mjs — 유출 검사
 *
 * 디자인 도구가 왜 비밀을 검사하나: 이 저장소의 산출물은 **배포되는 파일**이다.
 * 매니페스트에 적힌 문자열은 렌더 결과에 그대로 들어가고, HTML은 사람에게 보내진다.
 * 스크린샷에 키가 찍히는 사고는 커밋에 키가 들어가는 사고만큼 흔하다.
 *
 * 규칙: 형태로 확신할 수 있는 것만 오류로 올린다. 엔트로피 추정으로 "비밀 같다"고
 * 말하기 시작하면 해시·색상표·base64 이미지가 전부 걸려 아무도 보고서를 읽지 않는다.
 */

import fs from 'node:fs';
import path from 'node:path';

export const id = 'security';
export const title = '보안 · 유출';

/**
 * 발급 기관이 접두어를 고정해 둔 것들만 모았다. 접두어가 있으면 오탐이 거의 없다.
 * 값 부분은 실제 키의 최소 길이보다 짧게 잡아 잘린 키도 잡는다.
 */
const SECRET_PATTERNS = [
  { id: 'openai', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, label: 'OpenAI API 키' },
  { id: 'anthropic', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, label: 'Anthropic API 키' },
  { id: 'github', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g, label: 'GitHub 토큰' },
  { id: 'github-pat', re: /\bgithub_pat_[A-Za-z0-9_]{40,}/g, label: 'GitHub 세분화 토큰' },
  { id: 'gitlab', re: /\bglpat-[A-Za-z0-9_-]{18,}/g, label: 'GitLab 토큰' },
  { id: 'aws', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, label: 'AWS 액세스 키 ID' },
  { id: 'google', re: /\bAIza[0-9A-Za-z_-]{33,}/g, label: 'Google API 키' },
  { id: 'slack', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, label: 'Slack 토큰' },
  { id: 'slack-hook', re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/+_-]{20,}/g, label: 'Slack 수신 웹훅' },
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g, label: '개인 키' },
  { id: 'npm', re: /\bnpm_[A-Za-z0-9]{30,}/g, label: 'npm 토큰' },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, label: 'JWT' },
];

/** 자산으로 등록하면 안 되는 파일들. 등록되면 렌더 경로에서 읽히고 복사된다. */
const SECRET_FILE = /(^|[/\\])(\.env(\.[\w-]+)?|\.npmrc|\.netrc|id_[a-z]+|credentials(\.json)?|service-account.*\.json|.*\.(pem|key|p12|pfx|keystore|jks))$/i;

/** 사람의 계정 이름이 그대로 드러나는 절대 경로. */
const HOME_PATH = /(?:[A-Za-z]:[\\/]Users[\\/]|\/Users\/|\/home\/)([A-Za-z0-9._-]+)/g;

/** 받는 사람 쪽에서는 열리지 않는 주소. */
const PRIVATE_HOST = /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w.-]+\.(local|internal|lan|test))\b/gi;

/** 산출물을 훑을 때 여는 최대 크기. 영상·이미지는 대상이 아니다. */
const MAX_SCAN_BYTES = 4 * 1024 * 1024;
const TEXT_OUTPUT = /\.(html?|svg|json|css|js|mjs|srt|vtt|md|txt|sh)$/i;

export function run(ctx) {
  const findings = [];

  for (const { value, where } of walkStrings(ctx.manifest, 'design-project.json')) {
    findings.push(...scanString(value, where, { origin: 'manifest' }));
  }

  for (const artRef of ctx.manifest.artifacts || []) {
    const irPath = path.resolve(ctx.dir, artRef.ir || '');
    if (!artRef.ir || !fs.existsSync(irPath)) continue;
    let ir;
    try {
      ir = JSON.parse(fs.readFileSync(irPath, 'utf8'));
    } catch {
      continue; // structure.mjs가 잡는다
    }
    for (const { value, where } of walkStrings(ir, artRef.ir)) {
      findings.push(...scanString(value, where, { origin: 'ir' }));
    }
  }

  // 자산·출처 경로가 가리키는 파일 자체
  for (const asset of ctx.manifest.assets || []) {
    if (asset.path && SECRET_FILE.test(asset.path)) {
      findings.push({
        check: 'secret.file',
        level: 'error',
        where: `assets[${asset.id}].path`,
        message: `비밀이 담기는 종류의 파일이 자산으로 등록돼 있습니다: ${asset.path}. 렌더·내보내기 경로가 이 파일을 읽고 산출물 옆으로 복사합니다.`,
      });
    }
  }

  /* 산출물 — 여기까지 온 비밀은 이미 배포 대상이다. 원본에는 없고 산출물에만 있는
     경우가 실제로 있다(인라인된 자산, 붙여 넣은 스크립트). 그래서 따로 훑는다. */
  for (const artRef of ctx.manifest.artifacts || []) {
    for (const out of artRef.outputs || []) {
      const abs = path.resolve(ctx.dir, out.path);
      if (!TEXT_OUTPUT.test(out.path) || !fs.existsSync(abs)) continue;
      const stat = fs.statSync(abs);
      if (stat.size > MAX_SCAN_BYTES) continue;
      const text = fs.readFileSync(abs, 'utf8');
      for (const pattern of SECRET_PATTERNS) {
        pattern.re.lastIndex = 0;
        const hit = pattern.re.exec(text);
        if (!hit) continue;
        findings.push({
          check: 'secret.output',
          level: 'error',
          where: `artifacts[${artRef.id}].outputs → ${out.path}`,
          message: `산출물 안에 ${pattern.label}로 보이는 값이 있습니다 (${mask(hit[0])}). 이 파일은 배포 대상입니다.`,
        });
      }
    }
  }

  return findings;
}

function scanString(value, where, { origin }) {
  const findings = [];

  for (const pattern of SECRET_PATTERNS) {
    pattern.re.lastIndex = 0;
    const hit = pattern.re.exec(value);
    if (!hit) continue;
    findings.push({
      check: 'secret.key',
      level: 'error',
      where,
      message: `${pattern.label}로 보이는 값이 있습니다: ${mask(hit[0])}. 매니페스트와 IR은 그대로 렌더 결과에 들어갑니다 — 값을 지우고 발급처에서 폐기하세요.`,
    });
  }

  HOME_PATH.lastIndex = 0;
  const home = HOME_PATH.exec(value);
  if (home && !/^(user|users|runner|root|home|claude)$/i.test(home[1])) {
    findings.push({
      check: 'secret.homePath',
      level: 'warn',
      where,
      message: `개인 절대 경로가 들어 있습니다: ${home[0]}. 계정 이름이 드러나고, 받는 쪽에서는 존재하지 않는 경로입니다. 프로젝트 기준 상대 경로로 바꾸세요.`,
    });
  }

  PRIVATE_HOST.lastIndex = 0;
  const host = PRIVATE_HOST.exec(value);
  if (host) {
    findings.push({
      check: 'secret.privateHost',
      level: 'warn',
      where,
      message: `내부 주소가 들어 있습니다: ${host[0]}. ${
        origin === 'ir' ? '산출물에 실린 이 링크는 독자에게서 열리지 않습니다.' : '출처로 적어도 다른 사람은 확인할 수 없습니다.'
      }`,
    });
  }

  return findings;
}

/** 값을 보고서에 그대로 옮기면 보고서가 두 번째 유출이 된다. */
function mask(s) {
  const str = String(s);
  if (str.length <= 12) return `${str.slice(0, 4)}…`;
  return `${str.slice(0, 8)}…${str.slice(-2)} (${str.length}자)`;
}

/** 객체 안의 모든 문자열을 경로와 함께 낸다. */
function* walkStrings(node, prefix, depth = 0) {
  if (depth > 12) return;
  if (typeof node === 'string') {
    yield { value: node, where: prefix };
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) yield* walkStrings(node[i], `${prefix}[${i}]`, depth + 1);
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) yield* walkStrings(value, `${prefix} → ${key}`, depth + 1);
  }
}
