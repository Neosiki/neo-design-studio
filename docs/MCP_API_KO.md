# MCP · REST API 가이드

> 로드맵 5.5 구현. 앞 단계: [`DESIGN_CLI_KO.md`](./DESIGN_CLI_KO.md)

## 왜 필요한가

CLI는 사람이 터미널에서 치기 좋게 만들어졌다. 에이전트에게는 다르다 — 셸을 열고, stdout을 파싱하고, 종료 코드를 해석해야 한다. 중간에 형식이 조금만 바뀌어도 조용히 깨진다.

MCP·REST는 같은 일을 **구조화된 계약**으로 제공한다. 입력에는 JSON Schema가 붙고, 출력은 파싱할 필요 없는 JSON이고, 실패는 예외가 아니라 `{ ok: false, code, errors }`다.

세 표면(CLI·MCP·REST)은 모두 `scripts/design/lib/api/operations.mjs` 한 곳의 작업 정의를 부른다. 갈라질 수가 없다.

## MCP 서버

```bash
node scripts/design/mcp.mjs --tools     # 도구 목록 확인 (설정 점검용)
```

의존성이 없다. MCP는 JSON-RPC 2.0에 개행 구분 프레이밍이라 직접 구현했다 — SDK를 넣으면 "설치 없이 시작"이 깨진다.

### 설정

Claude Code · Codex · Cursor 모두 같은 형식이다.

```json
{
  "mcpServers": {
    "design-studio": {
      "command": "node",
      "args": ["/path/to/design-studio/scripts/design/mcp.mjs"],
      "env": { "DESIGN_PROJECT": "/path/to/my-project" }
    }
  }
}
```

`DESIGN_PROJECT`를 주면 도구를 부를 때마다 `project`를 적지 않아도 된다.

| 클라이언트 | 설정 위치 |
|---|---|
| Claude Code | `claude mcp add design-studio -- node /path/to/scripts/design/mcp.mjs` 또는 `.mcp.json` |
| Cursor | `.cursor/mcp.json` |
| Codex | `~/.codex/config.toml`의 `[mcp_servers]` |

## 도구 12개

| 도구 | 하는 일 |
|---|---|
| `design_status` | 상태 요약 + **다음에 할 일 제안**. 작업을 이어받을 때 먼저 부른다 |
| `design_inspect` | 산출물 구조를 컨테이너·블록 단위로. revise에 쓸 id를 여기서 얻는다 |
| `design_init` | 새 프로젝트 매니페스트 |
| `design_plan` | IR 골격 생성. `srt`를 주면 화이트보드 장면 계획까지 |
| `design_generate` | 빌드 + 렌더 (캐시 적용, 승인 게이트 확인) |
| `design_revise` | **구조적 편집** — 바꿀 것만 지정 |
| `design_verify` | 품질 게이트, qa.json + 보고서 |
| `design_export` | pptx · pdf · mp4 |
| `design_approve` | 승인 기록 (사용자 확인 없이 부르지 않는다) |
| `design_checkpoint` | create · list · restore · diff |
| `design_styles` | 스타일 60종 검색·조회·**삼방향 후보**·적용 |
| `design_revisionQueue` | Studio 편집기에서 사용자가 남긴 수정 요청 |

`status`와 `inspect`만 `readOnlyHint: true`다. 나머지는 모두 쓰기 작업이지만 `destructiveHint`는 전부 `false`다 — 쓰기 전에 체크포인트가 찍히고 검사를 통과해야 하므로 되돌릴 수 없는 작업이 없다.

## 에이전트가 쓰는 순서

```
status          지금 어디까지 왔나, 다음에 뭘 해야 하나
  ↓
inspect         고칠 대상의 정확한 id
  ↓
revise          바꿀 것만 지정 (dryRun으로 먼저 확인 가능)
  ↓
generate        다시 렌더
  ↓
verify          검수 통과 확인
```

## revise — 이 계층의 핵심

IR을 통째로 다시 써서 넘기면 한 글자 고치려고 수천 줄을 왕복해야 하고, 그 과정에서 관계없는 부분이 조용히 바뀐다. 그래서 **무엇을 바꾸는지만** 말한다.

```json
{
  "operations": [
    { "op": "setText", "artifact": "deck", "block": "cover-title", "value": "하나의 매니페스트" },
    { "op": "setToken", "group": "color", "key": "accent", "value": "#7cc4ff" },
    { "op": "reorder", "artifact": "deck", "order": ["cover", "problem", "scope", "approach", "closing"] }
  ]
}
```

| 연산 | 하는 일 |
|---|---|
| `setText` `setItems` `setAlt` | 텍스트·목록·대체 텍스트 |
| `setStyle` | fontSize · weight · color · align · lineHeight · **letterSpacing** · maxLines |
| `setBox` | 블록 위치·크기 (영상이면 레이어 region도 함께) |
| `setRegion` | 영상 레이어 영역 — 블록 없이 `render.art`만 있는 레이어(화이트보드)는 이걸 쓴다 |
| `setToken` `setFont` | 브랜드 토큰·글꼴 |
| `reorder` | 슬라이드·장면·섹션 순서 |
| `setTiming` `setLayerTiming` `setSubtitle` | 영상 타이밍과 자막 |
| `addClaim` | 주장·수치에 출처 연결 |

### 보증 세 가지

**원자적이다.** 메모리에서 전부 적용하고 검사한 뒤, 통과했을 때만 디스크에 쓴다. 연산 다섯 개 중 네 번째가 실패하면 앞의 셋도 반영되지 않는다.

**자동으로 정합성을 맞춘다.** 장면 순서나 길이를 바꾸면 타임라인이 다시 이어지고, 영역을 옮기면 **선노출 보호 영역이 다시 계산된다.** 사람이 손으로 관리할 정보가 아니다.

**오류가 스스로를 고친다.** 없는 id를 지목하면 있는 id 목록을 돌려준다.

```json
{
  "ok": false, "code": 2,
  "errors": [{
    "where": "operations[0] setText",
    "message": "블록을 찾을 수 없습니다: ghost. 있는 것: cover/cover-eyebrow, cover/cover-title, …"
  }],
  "hint": "아무것도 바뀌지 않았습니다. 연산을 고쳐 다시 부르세요."
}
```

`dryRun: true`면 검사만 하고 쓰지 않는다.

## REST API

```bash
node scripts/design/serve.mjs --port 7801 --project /path/to/project
curl localhost:7801/ops
curl -X POST localhost:7801/ops/verify -H 'content-type: application/json' -d '{"strict":true}'
```

| 경로 | 하는 일 |
|---|---|
| `GET /health` | 살아 있는지 |
| `GET /ops` | 작업 목록 + 입력 스키마 + 종료 코드 설명 |
| `POST /ops/<name>` | 작업 실행 |
| `GET /ops/<name>?a=1` | 읽기 전용 작업만 |

종료 코드가 HTTP 상태로 매핑된다. 본문에는 늘 원래 `code`가 함께 온다.

| 코드 | HTTP | 뜻 |
|---:|---:|---|
| 0 | 200 | 성공 |
| 1 | 400 | 사용법 오류 |
| 2 | 422 | 스키마 위반 |
| 3 | **409** | 승인 게이트 미통과 |
| 4 | 422 | 검수 실패 |
| 5 | 501 | 의존성 없음 |
| 6 | 404 | 대상 없음 |

### 노출 경계

기본은 `127.0.0.1`이다. 이 서버는 **파일을 쓰는 작업을 노출**하므로 루프백 밖에 열려면 토큰이 필요하다.

```bash
node scripts/design/serve.mjs --host 0.0.0.0 --token "$(openssl rand -hex 24)"
curl -H "Authorization: Bearer $TOKEN" localhost:7801/ops
```

컨테이너처럼 노출 경계를 밖에서 통제한다면 `--allow-insecure-host`로 명시적으로 면제한다. 명시적으로 꺼야만 꺼지는 쪽이 안전하다.

## Docker

```bash
docker build -t design-studio .
docker run --rm -p 7801:7801 -v "$PWD/my-project:/project" design-studio
```

기본 이미지는 Node만 있으면 된다 — 핵심 작업이 의존성 없이 돌기 때문이다. pptx·pdf·mp4 내보내기가 필요하면:

```bash
docker build --build-arg WITH_EXPORT=1 -t design-studio:export .
```

MCP로 쓰려면 서버 대신 stdio 진입점을 띄운다.

```bash
docker run --rm -i -v "$PWD/my-project:/project" design-studio node scripts/design/mcp.mjs
```

## 모델 공급자 계층에 대하여

로드맵 5.5는 "OpenAI, Anthropic, Gemini, 로컬 모델 교체"를 적었다. 여기서는 **그 어댑터를 만들지 않았다.** 이유는 이렇다.

Design Studio의 CLI는 모델을 부르지 않는다. 생각은 에이전트가 하고, 여기서는 결정론적인 일만 한다 — 스키마 검증, 렌더링, 검수, 캐시. 모델 공급자 어댑터를 넣으려면 CLI가 직접 내용을 생성해야 하는데, 그러면 "누가 판단하는가"가 두 곳으로 갈라진다.

**MCP 자체가 공급자 중립 계층이다.** MCP를 말하는 모델이면 무엇이든 이 표면을 그대로 쓴다. 없는 추상화를 만들어 유지하는 것보다 이쪽이 정직하고, 새 모델이 나와도 손댈 곳이 없다.

## 테스트

```bash
node tests/run.mjs      # 238개 — MCP 프로토콜·REST 상태·revise 연산·스타일 레지스트리·조판/접근성/유출 검사 포함
```

MCP는 실제 프로세스를 띄워 개행 구분 JSON-RPC를 주고받는다. 깨진 JSON을 넣어도 죽지 않는지, 알림에 응답하지 않는지, stdout에 프로토콜 외 출력이 섞이지 않는지까지 확인한다. REST는 서버를 띄워 상태 코드 매핑을 확인하고, 마지막에 **REST와 MCP가 같은 결과를 내는지** 비교한다.
