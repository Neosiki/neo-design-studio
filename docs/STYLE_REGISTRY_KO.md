# 스타일 레지스트리

> 로드맵 5.6 구현. 원본: [`references/design-styles.md`](../references/design-styles.md)

## 문제

스타일 60종의 정본은 이미 63KB 문서다. 사람이 읽기에는 훌륭하지만 기계에게는 벽이다 — "발표자료용이면서 재현도 90% 이상인 대담한 스타일"을 찾으려면 문서를 다 읽어야 한다. 에이전트가 매번 그럴 수는 없다.

## 손으로 쓰지 않고 뽑아낸다

메타데이터를 따로 손으로 관리하면 둘이 **반드시** 갈라지고, 갈라진 뒤에는 어느 쪽이 맞는지 아무도 모른다. 그래서 문서에서 추출한다.

```bash
design styles rebuild     # references/design-styles.md → styles/registry.json
```

문서 60개 항목이 전부 같은 형태를 지키기 때문에 결정론적으로 파싱된다. 형태가 깨진 항목은 조용히 넘기지 않고 세어서 보고한다 — 문서가 바뀐 걸 알아야 하기 때문이다.

레지스트리에는 원본의 **내용 해시**가 함께 들어간다. 문서를 고치고 rebuild를 잊으면 `design styles list`가 경고한다. 해시는 줄바꿈을 LF로 맞춘 뒤 계산하므로 Windows 체크아웃이 낡음으로 오판되지 않는다.

## 유도한 값

문서에 직접 적힌 것(온도·재현도·용도·글꼴·참고사례)은 그대로 옮기고, 검색에 필요한 두 가지를 유도한다.

**배경 밝기(`contrast`)** — hex가 있으면 `…#0A0A0A바닥` 같은 바닥색 표기를 먼저 보고, 없으면 등장한 색의 극단값을, 그것도 없으면 낱말(`검정 바닥`·`베이지`·`전면 대비색`)을 본다. 근거가 셋 다 없으면 **`unknown`으로 둔다.** 60종 중 5종이 여기 해당하는데, 전부 색을 규정하지 않는 스타일(isotype 도해·픽토그램·노선도)이라 그게 정답이다.

**움직임(`motionLevel`)** — 구현 설명에서 읽는다. 유도 전에 hex를 지우는데, `#FF433D` 안의 `3D`가 3D 그래픽으로 읽혀 정적 스타일이 `expressive`로 분류된 적이 있기 때문이다.

문서가 3자리 hex(`순수검정#000`)를 쓴다는 점도 중요하다. 6자리만 보면 배경색 절반을 놓친다.

## 찾기

```bash
design styles list --supports deck --temperature bold --minFidelity 90
design styles list --text 스위스          # 이름·용도·DNA·참고사례를 함께 훑는다
design styles show swiss-grid-report
```

| 조건 | 값 |
|---|---|
| `--supports` | html · deck · video · infographic · image |
| `--section` | web · deck · infographic |
| `--temperature` | bold(대담) · neutral(중성) · quiet(차분) |
| `--contrast` | light · dark · mixed · unknown |
| `--motion` | none · subtle · moderate · expressive |
| `--minFidelity` | 0~100 |

결과는 재현도 높은 순이다. 낮은 것은 "이 부분은 단색으로 낮췄다"를 산출물에 밝혀야 해서 비용이 든다.

원문이 중국어라 한국어 검색어는 걸리지 않는다. 조건 필터가 주 수단이고 텍스트 검색은 보조다.

## 삼방향 후보 — 이 레지스트리의 존재 이유

```bash
design styles suggest                     # 프로젝트 브리프를 읽어서
design styles suggest --deliverables deck --seed my-seed
```

원본 문서가 실패 모드를 직접 지목한다.

> ❌ 세 방향이 전부 「미백+여백+포인트색 하나」로 가면 안 된다 — 그게 가장 흔한 실패다.

모델은 확정성 편향 때문에 조용한 극단으로 수렴한다. 그래서 `suggest`는 **온도가 겹치지 않는 세 개**를 보장한다.

| 자리 | 온도 | 왜 |
|---|---|---|
| A · 안정 기반 | quiet | 내용이 주인공이어야 할 때의 안전한 바닥 |
| B · 중간 대비 | neutral | 안정과 대담 사이의 균형 |
| C · 대담 주입 | bold | **문서가 강제하는 자리** |

가능하면 배경 밝기까지 다르게 고른다. 같은 씨앗은 같은 후보를 낸다 — 시계가 아니라 씨앗에서 뽑으므로 재현 가능하고, 씨앗을 바꾸면 다른 조합이 나온다.

**후보 목록은 삼방향 게이트가 아니다.** 이걸로 실제 초안 셋을 만들어 보여줘야 게이트다. CLI 출력도 매번 그렇게 말한다.

## 적용

```bash
design styles apply swiss-grid-report \
  --rationale "데이터가 주인공이고 인쇄물 같은 신뢰감이 필요하다" \
  --evidence a.html,b.html,c.html
```

`--rationale`은 필수다. 근거 없는 선택은 검수에서 걸린다.

### 색은 자동으로 넣지 않는다

`apply`는 예시 색을 브랜드 토큰에 **반영하지 않는다.** 원본 문서가 분명히 말한다.

> ⚠️ 조목의 hex는 예시 앵커이지 배합표가 아니다. 그대로 복사하는 건 더 나은 품질의 slop을 생산하는 것일 뿐이다.

배합표를 자동 적용하면 100명이 같은 색을 쓰게 되고 색의 정보량이 0이 된다. 색은 브랜드 자산·내용의 실제 이미지·문화 맥락에서 유도해야 한다. 그래서 팔레트는 참고로만 돌려주고, 넣는 건 사람이나 에이전트가 판단해서 `revise`의 `setToken`으로 한다.

## 검수 연동

`design check`가 두 가지를 본다.

- **`style.unknown`** — 레지스트리에 없는 id. 다만 **오타로 보일 때만** 경고한다(편집 거리 기준). 레지스트리 밖의 스타일은 문제가 아니다. 문서 자신이 "없을 때 참조하는 탄약이지 반드시 여기서 골라야 하는 목록이 아니다"라고 말한다 — 사용자 브랜드에서 자란 방향이 오히려 정상이다.
- **`style.fidelity`** — 재현도 70% 미만 스타일을 골랐으면 어느 부분을 단색으로 낮췄는지 밝히라고 경고한다.

## 에이전트에서

```json
{ "action": "suggest", "supports": ["deck"], "seed": "proj-1" }
{ "action": "search", "temperature": ["bold"], "minFidelity": 90 }
{ "action": "show", "id": "swiss-grid-report" }
{ "action": "apply", "id": "swiss-grid-report", "rationale": "…", "evidence": ["a.html","b.html","c.html"] }
```

MCP 도구 `design_styles`, REST `POST /ops/styles`. 없는 id를 주면 편집 거리로 가까운 것을 알려준다.

## 현재 분포

| 축 | 분포 |
|---|---|
| 분류 | web 20 · deck 20 · infographic 20 |
| 온도 | 대담 25 · 중성 19 · 차분 16 |
| 배경 | mixed 26 · dark 15 · light 14 · unknown 5 |

대담이 가장 많은 것은 의도된 배치다. 문서의 설명대로 모델의 확정성 편향이 조용한 쪽으로 쏠리기 때문에, 라이브러리 비율을 반대로 기울여 균형을 맞춘다.
