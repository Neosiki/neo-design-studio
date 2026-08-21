# App / iOS 프로토타입 전용 수칙 · 전체 조작 매뉴얼

> SKILL.md에서 파생된 전체 버전입니다. SKILL.md에는 7가지 핵심 규칙 요약이 포함되어 있으며, 본 문서는 각 규칙의 상세 설명입니다: 아키텍처 선정, 이미지 소스 및 코드, AppPhone JSX 골격, ios_frame 3단계 사용법, 스타일 앵커 전체 표.


iOS/Android/모바일 앱 프로토타입을 제작할 때(트리거: 「app 프로토타입」, 「iOS mockup」, 「모바일 응용 프로그램」, 「앱 만들기」), 다음 네 가지 규칙이 일반적인 placeholder 원칙을 **대체**합니다. 앱 프로토타입은 데모 현장이며, 정적인 연출이나 미색의 자리 표시자 카드는 설득력이 떨어집니다.

### 0. 아키텍처 선정 (필수 결정 사항)

**기본 단일 파일 inline React**——모든 JSX/data/styles를 메인 HTML의`<script type="text/babel">...</script>`태그, **사용하지 마세요**`<script src="components.jsx">` 외부 로드. 원인:`file://``file://` 프로토콜 하에서 브라우저가 외부 JS를 cross-origin으로 간주해 차단하므로, 사용자에게 HTTP 서버 구동을 강제하는 것은 「더블 클릭하면 바로 열린다」는 프로토타이핑의 직관에 위배됩니다. 로컬 이미지를 인용할 때는 반드시 base64 data URL로 내장하고, 서버가 존재한다고 가정하지 마세요.

**외부 파일 분리는 오직 다음 두 가지 경우에만 해당합니다**:
- (a) 단일 파일이 1000행을 초과하여 유지보수가 어려운 경우 → 다음으로 분리:`components.jsx` + `data.js`, 동시에 인도 설명을 명확히 하며 (`python3 -m http.server`명령어 + URL 접속）
- (b) 여러 subagent가 서로 다른 화면을 병렬로 작성해야 함 →`index.html` + 스크린별 독립 HTML (`today.html`/`graph.html`...), iframe 통합, 각 화면은 자체 포함된 단일 파일입니다

**선택 가이드**:

| 시나리오 | 아키텍처 | 전달 방식 |
|------|------|----------|
| 1인 4~6개 화면 프로토타입 제작(주류) | 단일 파일 inline | 하나의`.html`더블 클릭으로 열기 |
| 1인 대형 앱 제작 (>10개 화면) | 다중 jsx + server | 실행 명령 포함 |
| 다중 에이전트 병렬 실행 | 다중 HTML + iframe | 랜딩 페이지 |`index.html`집계, 화면별 독립 실행 가능 |

### 1. placeholder가 아닌 실제 이미지를 먼저 찾기

사용자의 요청을 기다리지 말고, SVG를 그리거나 빈 카드로 두는 대신 기본적으로 실제 이미지를 가져와 채우십시오. 주요 채널:

| 시나리오 | 기본 채널 |
|------|---------|
| 미술/박물관/역사 콘텐츠 | Wikimedia Commons(퍼블릭 도메인), Met Museum Open Access, Art Institute of Chicago API |
| 일반 생활/사진 | Unsplash, Pexels(저작권 무료) |
| 사용자 로컬 보유 소재 |`~/Downloads`, 프로젝트`_archive/`또는 사용자 설정 소재 라이브러리 |

Wikimedia 다운로드 시 주의사항 (로컬 curl은 프록시 TLS 연결 시 오류가 발생할 수 있으나, Python urllib은 정상적으로 작동함):```python
# 규정에 맞는 User-Agent는 필수입니다. 그렇지 않으면 429 오류가 발생합니다
UA = 'ProjectName/0.1 (https://github.com/you; you@example.com)'
# MediaWiki API로 실제 URL 조회
api = 'https://commons.wikimedia.org/w/api.php'
# action=query&list=categorymembers로 시리즈를 일괄로 가져오기 / prop=imageinfo+iiurlwidth로 지정한 너비의 thumburl 가져오기
```
**모든** 채널이 실패하거나 / 저작권이 불분명하거나 / 사용자가 명시적으로 요청한 경우**에만** 정직한 placeholder로 대체합니다(여전히 조잡한 SVG는 그리지 않습니다).

**실제 이미지 정직성 테스트**(핵심): 이미지를 가져오기 전에 스스로에게 물어보세요 — "이 이미지를 제거했을 때 정보의 손실이 있는가?"

| 시나리오 | 판단 | 동작 |
|------|------|------|
| 아티클/Essay 리스트의 커버, Profile 페이지의 풍경 헤더 이미지, 설정 페이지의 장식용 banner | 장식이며, 콘텐츠와 내재적 연관성이 없음 | **추가하지 마세요**. 추가하면 AI slop이며, 보라색 그라데이션과 다를 바 없습니다. |
| 박물관/인물 콘텐츠의 초상화, 제품 상세 페이지의 실물, 지도 카드의 장소 | 콘텐츠 그 자체이며, 내재적 연관성이 있음 | **반드시 추가** |
| 그래프/시각화 배경의 아주 연한 텍스처 | 분위기 조성용이며, 콘텐츠를 방해하지 않고 보조함 | 추가하되, opacity ≤ 0.08 |

**반면교사**: 텍스트 위주의 Essay에 Unsplash 「영감 이미지」를 배치하거나, 노트 App에 stock photo 모델을 배치하는 것은 모두 AI slop입니다. 실제 이미지를 사용할 권한이 있다고 해서 남용해도 된다는 뜻은 아닙니다.

### 2. 산출물 형태: 기본값은 「나열 + 조작 가능」, 사용자에게 묻지 말 것

iOS App 프로토타입의 **기본 산출물 형태는 단 한 가지이며, 사용자에게 「나열형으로 할지 조작 가능형으로 할지」 묻지 마세요**: **4-6개의 메인 화면을 나열하고, 각 화면이 모두 상호작용 가능해야 합니다**. 한눈에 전체 모습(여러 대의 iPhone이 나란히 배치됨)을 보면서도, 각 기기에서 탭 전환, 기본 조작(펼치기, 전환, 선택, 팝업 열기)이 가능해야 합니다. 두 가지 장점을 한 번에 제공하여 사용자가 고민하게 만들지 마세요.

| 항목 | 기본 방식 |
|------|---------|
| **화면 수** | **4-6개의 메인 화면**을 나열(단순히 나열하는 것이 아니라 앱의 핵심 기능을 커버해야 함). 6개가 넘을 경우 가장 중요한 4-6개를 선정하고, 나머지는 단일 기기 내에서 탭/네비게이션을 통해 접근 가능하게 함. |
| **레이아웃** | 여러 대의 독립된 iPhone을 가로로 배치 |`flexWrap`나란히 배치, 각 기기 상단에 어떤 화면인지 설명하는 한 줄의 italic 소형 텍스트 라벨 |
| **개별 상호작용** | 각 기기는 독립적인 미니 상태 머신임: tab bar 전환 가능, 화면 내 버튼/카드/스위치 클릭 가능, modal 팝업 가능 — 단순한 정적 이미지가 아님 |

**오직 두 가지 예외 상황에서만 기본 설정에서 벗어남** (사용자가 명시적으로 요청한 경우에만 적용하며, 그렇지 않으면 일괄적으로 기본 설정을 따름):
- 사용자가 명시적으로 "정적 스크린샷만 필요 / 클릭 기능 불필요 / layout만 확인"이라고 언급한 경우 → 순수 정적 overview로 회귀 (각 기기당 다음만 렌더링 `ScreenComponent`, 상태 머신 미연결)
- 사용자가 「하나의 프로세스만 시연 / 온보딩 진행 / 단일 기기 데모」를 명시함 → 단일 기기`AppPhone`전체 flow 진행

**기본 스켈레톤** (여러 대를 나열하며, 각 기기마다 state를 가진 AppPhone 하나씩 포함):```jsx
// 각 기기 = 독립 상태 머신 하나, 초기에는 자신이 담당하는 메인 화면에 위치함
function AppPhone({ initial }) {
  const [screen, setScreen] = React.useState(initial);
  const [modal, setModal] = React.useState(null);
  // screen에 따라 해당 ScreenComponent를 렌더링하고, onTabChange/onOpen/onClose/onToggle 등의 콜백을 전달함
  return (
    <IosFrame>
      <ScreenComponent
        screen={screen}
        onTabChange={setScreen}
        onOpen={setModal}
        onClose={() => setModal(null)}
      />
    </IosFrame>
  );
}

// 타일형: 4-6대가 나란히, 각 기기는 initial이 다른 메인 화면에 위치함
<div style={{display: 'flex', gap: 32, flexWrap: 'wrap', padding: 48, alignItems: 'flex-start'}}>
  {mainScreens.map(s => (
    <div key={s.id}>
      <div style={{fontSize: 13, color: '#666', marginBottom: 8, fontStyle: 'italic'}}>{s.label}</div>
      <AppPhone initial={s.id} />
    </div>
  ))}
</div>
```
Screen 컴포넌트 callback props 받기 (`onTabChange`、`onOpen`、`onClose`、`onToggle`、`onAnnotation`), 상태를 하드코딩하지 않습니다. TabBar, 버튼, 작품 카드, 스위치 추가`cursor: pointer`+ hover 피드백. 각 기기는 서로 다른 메인 화면에 위치하지만, tab 전환을 통해 서로 이동할 수 있습니다 — 타일형 배치는 전체적인 모습을 보여주고, 클릭은 상세한 깊이감을 제공합니다.

### 3. 배포 전 실제 클릭 테스트 실행

정적 스크린샷으로는 layout만 확인할 수 있으며, 인터랙션 버그는 직접 클릭해 봐야 발견할 수 있습니다. Playwright를 사용하여 3가지 최소 클릭 테스트를 실행하세요: 상세 페이지 진입 / 주요 어노테이션 포인트 / tab 전환. 확인`pageerror`재교부 0을 위해. Playwright 사용 가능.`npx playwright`호출하거나 로컬 전역 설치 경로에 따라 (`npm root -g` + `/playwright`).

### 4. 감도 앵커 (pursue list, fallback 기본 설정)

Design system이 없을 때 기본적으로 다음 방향을 지향하며, AI slop을 피합니다:

| 구분 | 선호 항목 | 지양 항목 |
|------|------|------|
| **폰트** | 세리프 display (Newsreader/Source Serif/EB Garamond) +`-apple-system`body | 전체 SF Pro 또는 Inter 사용——시스템 기본값과 너무 비슷하여 스타일이 없음 |
| **색상** | 따뜻한 느낌의 배경색 + **단일** 액센트가 전체를 관통(rust 오렌지/다크 그린/딥 레드) | 다색 클러스터링(데이터에 실제로 3개 이상의 분류 차원이 있는 경우 제외) |
| **정보 밀도 · 절제형** (기본) | 컨테이너 한 층 줄이기, 보더 하나 줄이기, **장식용** 아이콘 하나 줄이기——콘텐츠에 숨통 틔워주기 | 모든 카드에 의미 없는 아이콘 + tag + status dot 배치 |
| **정보 밀도 · 고밀도형** (예외) | 제품의 핵심 셀링 포인트가 「지능 / 데이터 / 컨텍스트 인지」일 때(AI 도구, Dashboard, Tracker, Copilot, 뽀모도로 타이머, 건강 모니터링, 가계부 등), 화면당 **최소 3곳의 가시적인 제품 차별화 정보**가 필요함: 비장식적 데이터, 대화/추론 단편, 상태 추론, 컨텍스트 연관성 | 버튼 하나와 시계 하나만 배치——AI의 지능적인 느낌이 드러나지 않아 일반 App과 차이가 없음 |
| **디테일 시그니처** | 「스크린샷을 찍을 만한」 질감을 한 곳에 남기기: 아주 옅은 유화 질감 배경 / serif 이탤릭체 인용구 / 전체 화면 블랙 배경의 녹음 파형 | 모든 곳에 힘을 분산하여 결과적으로 모든 곳이 밋밋함 |

**두 가지 원칙이 동시에 적용됨**:
1. 품격 = 한 가지 디테일을 120%로 구현하고 나머지는 80%로 구현——모든 곳이 정교한 것이 아니라, 적절한 곳에서 충분히 정교해야 함
2. 뺄셈은 fallback이지 보편적인 법칙이 아님——제품의 핵심 셀링 포인트가 정보 밀도의 뒷받침을 필요로 할 때(AI / 데이터 / 컨텍스트 인지류), 덧셈이 절제보다 우선함. 자세한 내용은 아래 「정보 밀도 유형」 참조

### 5. iOS 기기 프레임은 반드시`assets/ios_frame.jsx`—— Dynamic Island / status bar 직접 제작 금지

iPhone mockup 제작 시 **강제 바인딩**`assets/ios_frame.jsx`iPhone 15 Pro의 정밀 사양에 맞춰 정렬된 표준 쉘입니다: bezel, Dynamic Island(124×36, top:12, 중앙 정렬), status bar(시간/신호/배터리, 양측 아일랜드 회피, vertical center 아일랜드 중심선 정렬), Home Indicator, content 영역 top padding이 모두 처리되어 있습니다.

**HTML 내에 다음 항목을 직접 작성하는 것을 금지합니다**:
-`.dynamic-island` / `.island` / `position: absolute; top: 11/12px; width: ~120; 가운데 정렬된 검은색 둥근 모서리 사각형`
- `.status-bar` with 손글씨 스타일의 시간/신호/배터리 아이콘`.home-indicator`/ 하단 home bar
- iPhone bezel의 라운드 외곽 프레임 + 블랙 테두리 + shadow

직접 작성하면 99% 확률로 위치 버그가 발생합니다. status bar의 시간/배터리가 아일랜드에 눌리거나, content top padding 계산 오류로 첫 번째 줄 내용이 아일랜드 아래에 가려질 수 있습니다. iPhone 15 Pro의 노치(Dynamic Island)는 **고정 124×36 픽셀**이며, status bar 양측에 남은 가용 너비가 매우 좁으므로 임의로 추측해서는 안 됩니다.

**사용법 (엄격한 3단계):**```jsx
// 단계 1: 이 스킬의 assets/ios_frame.jsx（본 SKILL.md에 대한 상대 경로）를 읽으세요
// 단계 2: iosFrameStyles 상수 전체 + IosFrame 컴포넌트를 당신의 <script type="text/babel"> 안에 붙여넣으세요
// 단계 3: 당신의 화면 컴포넌트를 <IosFrame>...</IosFrame>로 감싸고, island/status bar/home indicator는 건드리지 마세요
<IosFrame time="9:41" battery={85}>
  <YourScreen />  {/* 내용은 top 54부터 렌더링되며, 아래는 home indicator를 위해 남겨두었습니다. 신경 쓰지 않으셔도 됩니다 */}
</IosFrame>
```
**예외**: 사용자가 명시적으로 「iPhone 14 일반 모델(Pro 아님)의 노치인 것처럼 처리」, 「iOS가 아닌 Android로 제작」, 「기기 형태 사용자 정의」를 요청하는 경우에만 우회합니다. — 이때는 해당`android_frame.jsx` 또는 수정 
`ios_frame.jsx`의 상수이며, 프로젝트 HTML 내에 별도의 island/status bar를 **추가하지 마세요**.