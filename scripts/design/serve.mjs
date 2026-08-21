#!/usr/bin/env node
/**
 * serve.mjs — 로컬 REST API (node:http, 의존성 없음)
 *
 * MCP를 못 쓰는 클라이언트(웹 UI, 사내 도구, curl)를 위한 같은 표면이다.
 * 작업 정의는 lib/api/operations.mjs 한 곳에만 있으므로 MCP와 갈라질 수 없다.
 *
 *   node scripts/design/serve.mjs --port 7801 --project /path/to/project
 *
 * 엔드포인트
 *   GET  /health                    살아 있는지
 *   GET  /ops                       작업 목록과 입력 스키마
 *   POST /ops/<name>                작업 실행 (본문은 입력 JSON)
 *   GET  /ops/<name>?a=1            읽기 전용 작업은 GET으로도
 *
 * 종료 코드는 HTTP 상태로 매핑된다: 3→409(승인 미완), 4→422(검수 실패),
 * 5→501(의존성 없음), 6→404. 본문에는 늘 원래 code가 함께 온다.
 *
 * 기본은 127.0.0.1 바인딩이다. 이 서버는 파일을 쓰는 작업을 노출하므로
 * 인증 없이 외부에 열지 않는다 — --host를 바꾸려면 --token을 함께 줘야 한다.
 */

import http from 'node:http';
import { operations, runOperation, HTTP_STATUS } from './lib/api/operations.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  return v && !v.startsWith('--') ? v : true;
};

const PORT = Number(flag('port', process.env.DESIGN_PORT || 7801));
const HOST = String(flag('host', process.env.DESIGN_HOST || '127.0.0.1'));
const PROJECT = flag('project', process.env.DESIGN_PROJECT) || undefined;
const TOKEN = flag('token', process.env.DESIGN_TOKEN) || null;
const ALLOW_INSECURE = !!flag('allow-insecure-host', process.env.DESIGN_ALLOW_INSECURE_HOST);
const LOOPBACK = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';

if (!LOOPBACK && !TOKEN && !ALLOW_INSECURE) {
  process.stderr.write(
    '거부: 이 서버는 파일을 쓰는 작업을 인증 없이 노출합니다.\n' +
      `  루프백이 아닌 주소(${HOST})에 열려면 토큰을 주세요:\n` +
      '    node scripts/design/serve.mjs --host 0.0.0.0 --token "$(openssl rand -hex 24)"\n' +
      '  컨테이너처럼 노출 경계를 밖에서 통제한다면 명시적으로 면제하세요:\n' +
      '    --allow-insecure-host  (또는 DESIGN_ALLOW_INSECURE_HOST=1)\n'
  );
  process.exit(1);
}

const json = (res, status, body) => {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) { reject(new Error('본문이 8MB를 넘습니다')); req.destroy(); return; }
      data += c;
    });
    req.on('end', () => {
      if (!data.trim()) { resolve({}); return; }
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`JSON 파싱 실패: ${e.message}`)); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (TOKEN) {
    const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token');
    if (given !== TOKEN) { json(res, 401, { ok: false, code: 1, errors: [{ message: '인증 실패' }] }); return; }
  }

  if (url.pathname === '/health') {
    json(res, 200, { ok: true, server: 'design-studio', version: '1.0.0', project: PROJECT || null, operations: Object.keys(operations).length });
    return;
  }

  if (url.pathname === '/ops' && req.method === 'GET') {
    json(res, 200, {
      ok: true,
      operations: Object.entries(operations).map(([name, op]) => ({
        name, title: op.title, description: op.description, readOnly: !!op.readOnly, schema: op.schema,
        endpoint: `${op.readOnly ? 'GET|POST' : 'POST'} /ops/${name}`,
      })),
      exitCodes: { 0: '성공', 1: '사용법', 2: '스키마 위반', 3: '승인 게이트 미통과', 4: '검수 실패', 5: '의존성 없음', 6: '대상 없음' },
    });
    return;
  }

  const m = url.pathname.match(/^\/ops\/([a-zA-Z]+)$/);
  if (m) {
    const name = m[1];
    const op = operations[name];
    if (!op) { json(res, 404, { ok: false, code: 1, errors: [{ message: `알 수 없는 작업: ${name}` }] }); return; }
    if (req.method !== 'POST' && !(req.method === 'GET' && op.readOnly)) {
      json(res, 405, { ok: false, code: 1, errors: [{ message: `${name}은 POST로 부릅니다` }] });
      return;
    }

    let input;
    try {
      input = req.method === 'GET' ? Object.fromEntries(url.searchParams) : await readBody(req);
    } catch (e) {
      json(res, 400, { ok: false, code: 1, errors: [{ message: e.message }] });
      return;
    }
    if (PROJECT && input.project === undefined) input.project = PROJECT;

    const result = runOperation(name, input);
    json(res, HTTP_STATUS[result.code] ?? 500, result);
    return;
  }

  json(res, 404, { ok: false, code: 6, errors: [{ message: `없는 경로: ${url.pathname}` }], hint: 'GET /ops 로 작업 목록을 보세요' });
});

server.listen(PORT, HOST, () => {
  process.stderr.write(`Design Studio API → http://${HOST}:${PORT}\n`);
  process.stderr.write(`  작업 ${Object.keys(operations).length}개 · 프로젝트 ${PROJECT || '(요청마다 지정)'}\n`);
  if (TOKEN) process.stderr.write('  토큰 인증 켜짐 (Authorization: Bearer …)\n');
  else if (!LOOPBACK) {
    process.stderr.write(
      '  ⚠ 인증 없이 루프백 밖에 열려 있습니다. 노출 경계(방화벽·docker -p)를 반드시 밖에서 통제하세요.\n'
    );
  }
  process.stderr.write(`  목록: curl http://${HOST}:${PORT}/ops\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
