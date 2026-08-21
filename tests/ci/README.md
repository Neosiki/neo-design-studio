# CI 전용 확인 스크립트

CI 워크플로 안에 heredoc으로 적지 않고 파일로 둔 이유가 있다.

`cat > /tmp/x.mjs` 로 만든 스크립트가 `import './scripts/...'` 를 쓰면, ESM은 그
경로를 **스크립트 자신의 위치** 기준으로 푼다. 즉 `/tmp/scripts/...` 를 찾다가
`ERR_MODULE_NOT_FOUND` 로 죽는다. 워크플로를 고쳐 커밋하고 밀어 본 뒤에야 알게 되는
종류의 실수다.

여기 있는 파일들은 저장소 안에 있으므로 상대 경로가 맞고, 무엇보다 **로컬에서 그대로
돌려 볼 수 있다.**

```bash
node tests/ci/typo-parity.mjs     # 렌더러와 검사기가 같은 조판 기준을 쓰는가
node tests/ci/secret-canary.mjs   # 유출 검사가 살아 있는가 (일부러 키를 심어 본다)
node tests/ci/three-way.mjs       # 삼방향 후보의 온도가 겹치지 않는가
```

전부 실패하면 0이 아닌 코드로 끝나고, GitHub Actions가 읽는 `::error::` 형식으로 이유를 낸다.
