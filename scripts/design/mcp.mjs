#!/usr/bin/env node
/**
 * mcp.mjs — Design Studio MCP 서버 (stdio, 의존성 없음)
 *
 * 왜 SDK를 안 쓰나: 이 저장소의 나머지가 전부 의존성 없이 도는데 MCP 하나 때문에
 * node_modules를 요구하면 "설치 없이 시작"이 깨진다. MCP는 JSON-RPC 2.0에
 * 개행 구분 프레이밍이라 직접 구현해도 200줄이 안 된다.
 *
 * 노출하는 도구는 lib/api/operations.mjs의 작업 표면 그대로다. REST 서버와 같은
 * 코드를 부르므로 두 표면이 갈라질 수 없다.
 *
 * 설정 예 (Claude Code · Codex · Cursor 공통 형식):
 *   {
 *     "mcpServers": {
 *       "design-studio": {
 *         "command": "node",
 *         "args": ["/path/to/design-studio/scripts/design/mcp.mjs"],
 *         "env": { "DESIGN_PROJECT": "/path/to/my-project" }
 *       }
 *     }
 *   }
 *
 * DESIGN_PROJECT를 주면 도구를 부를 때마다 project를 적지 않아도 된다.
 */

import { operations, runOperation } from './lib/api/operations.mjs';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER = { name: 'design-studio', version: '1.0.0' };
const DEFAULT_PROJECT = process.env.DESIGN_PROJECT || undefined;

/* ── 도구 목록 ────────────────────────────────────────────────── */

const TOOL_PREFIX = 'design_';

function toolList() {
  return Object.entries(operations).map(([name, op]) => ({
    name: TOOL_PREFIX + name,
    description: `${op.title} — ${op.description}`,
    inputSchema: op.schema,
    annotations: {
      title: op.title,
      readOnlyHint: !!op.readOnly,
      // 되돌릴 수 없는 작업은 없다: 쓰기 전에 체크포인트가 찍히고 검사가 통과해야 한다
      destructiveHint: false,
      idempotentHint: !!op.readOnly,
    },
  }));
}

/* ── JSON-RPC ─────────────────────────────────────────────────── */

const RPC = {
  initialize() {
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER,
      instructions:
        'Design Studio 프로젝트를 다룬다. 먼저 design_status로 상태를 보고, ' +
        'design_inspect로 고칠 대상의 id를 확인한 뒤 design_revise로 바꿀 것만 지정한다. ' +
        'design_approve는 사용자 확인 없이 부르지 않는다 — 삼방향 게이트는 초안 3개의 증거를 요구한다. ' +
        '실패는 예외가 아니라 ok=false와 code로 돌아온다(3=승인 미완, 4=검수 실패, 5=의존성 없음).',
    };
  },

  'tools/list': () => ({ tools: toolList() }),

  'tools/call'(params) {
    const name = String(params?.name || '');
    if (!name.startsWith(TOOL_PREFIX)) {
      return toolError(`알 수 없는 도구: ${name}`);
    }
    const opName = name.slice(TOOL_PREFIX.length);
    if (!operations[opName]) {
      return toolError(`알 수 없는 도구: ${name}. 가능: ${Object.keys(operations).map((n) => TOOL_PREFIX + n).join(', ')}`);
    }

    const input = { ...(params.arguments || {}) };
    if (DEFAULT_PROJECT && input.project === undefined) input.project = DEFAULT_PROJECT;

    const result = runOperation(opName, input);
    return {
      // 결과는 사람이 읽는 문장이 아니라 구조화된 JSON이다. 에이전트가 파싱할 대상이
      // 문장이면 그건 계약이 아니다.
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      isError: !result.ok,
      structuredContent: result,
    };
  },

  ping: () => ({}),
};

function toolError(message) {
  return { content: [{ type: 'text', text: JSON.stringify({ ok: false, code: 1, errors: [{ message }] }) }], isError: true };
}

/* ── 프레이밍 ─────────────────────────────────────────────────── */

let buffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  // eslint-disable-next-line no-cond-assign
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (line) handleLine(line);
  }
});
process.stdin.on('end', () => {
  const line = buffer.trim();
  if (line) handleLine(line);
  // process.exit()로 강제 종료하면 파이프에 남은 긴 JSON 응답이 잘릴 수 있다.
  // 이벤트 루프가 stdout 쓰기를 모두 비운 뒤 자연스럽게 끝나도록 둔다.
});

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function handleLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON 파싱 실패' } });
    return;
  }

  // 알림(id 없음)에는 응답하지 않는다
  if (msg.id === undefined || msg.id === null) return;

  const handler = RPC[msg.method];
  if (!handler) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `지원하지 않는 메서드: ${msg.method}` } });
    return;
  }

  try {
    send({ jsonrpc: '2.0', id: msg.id, result: handler(msg.params) });
  } catch (e) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } });
  }
}

// stdout은 프로토콜 전용이다. 로그가 섞이면 클라이언트가 파싱에 실패한다.
console.log = (...args) => process.stderr.write(`${args.join(' ')}\n`);

if (process.argv.includes('--tools')) {
  // 설정 점검용: 도구 목록을 사람이 읽는 형태로 stderr에 찍고 끝낸다
  process.stderr.write(`${SERVER.name} v${SERVER.version} — 도구 ${Object.keys(operations).length}개\n\n`);
  for (const tool of toolList()) {
    process.stderr.write(`  ${tool.name}${tool.annotations.readOnlyHint ? ' (읽기 전용)' : ''}\n`);
    process.stderr.write(`      ${tool.description.split('\n')[0]}\n`);
  }
  process.stderr.write(`\nDESIGN_PROJECT=${DEFAULT_PROJECT || '(미설정 — 도구마다 project를 넘겨야 함)'}\n`);
  process.exit(0);
}
