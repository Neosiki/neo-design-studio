# Tweaks: 디자인 변체 실시간 파라미터 조정

Tweaks는 사용자가 코드를 수정하지 않고도 실시간으로 variations를 전환하거나 파라미터를 조정할 수 있게 해주는 이 skill의 핵심 기능입니다.

**에이전트 간 환경 호환성**: 일부 design-agent 네이티브 환경(예: Claude.ai Artifacts)은 호스트의 postMessage를 사용하여 tweak 값을 소스 코드에 다시 써서 영구 저장합니다. 본 skill은 **순수 프론트엔드 localStorage 방식**을 채택했습니다. 효과는 동일하며(새로고침 시 상태 유지), 영구 저장은 소스 파일이 아닌 브라우저의 localStorage에서 이루어집니다. 이 방식은 모든 에이전트 환경(Claude Code / Codex / Cursor / Trae / etc.)에서 작동합니다.

## Tweaks 추가 시점

- 사용자가 명시적으로 "파라미터 조정 가능" 또는 "여러 버전 전환"을 요구할 때
- 디자인에 비교가 필요한 여러 variations가 있을 때
- 사용자가 명시하지 않았더라도, **몇 가지 영감을 주는 tweaks를 추가하는 것이 사용자가 가능성을 확인하는 데 도움이 된다고 판단될 때** 주관적으로 추가합니다.

기본 권장 사항: 사용자의 요청이 없더라도 **모든 디자인에 2~3개의 tweaks**(색상 테마 / 글자 크기 / layout 변체)를 추가하세요. 사용자가 가능성의 범위를 볼 수 있게 하는 것은 디자인 서비스의 일부입니다.

## 구현 방식 (순수 프론트엔드 버전)

### 기본 구조```jsx
const TWEAK_DEFAULTS = {
  "primaryColor": "#D97757",
  "fontSize": 16,
  "density": "comfortable",
  "dark": false
};

function useTweaks() {
  const [tweaks, setTweaks] = React.useState(() => {
    try {
      const stored = localStorage.getItem('design-tweaks');
      return stored ? { ...TWEAK_DEFAULTS, ...JSON.parse(stored) } : TWEAK_DEFAULTS;
    } catch {
      return TWEAK_DEFAULTS;
    }
  });

  const update = (patch) => {
    const next = { ...tweaks, ...patch };
    setTweaks(next);
    try {
      localStorage.setItem('design-tweaks', JSON.stringify(next));
    } catch {}
  };

  const reset = () => {
    setTweaks(TWEAK_DEFAULTS);
    try {
      localStorage.removeItem('design-tweaks');
    } catch {}
  };

  return { tweaks, update, reset };
}
```
### Tweaks 패널 UI

우측 하단 플로팅 패널. 접기 가능:```jsx
function TweaksPanel() {
  const { tweaks, update, reset } = useTweaks();
  const [open, setOpen] = React.useState(false);

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 9999,
    }}>
      {open ? (
        <div style={{
          background: 'white',
          border: '1px solid #e5e5e5',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
          width: 280,
          fontFamily: 'system-ui',
          fontSize: 13,
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: 16,
          }}>
            <strong>Tweaks</strong>
            <button onClick={() => setOpen(false)} style={{
              border: 'none', background: 'none', cursor: 'pointer', fontSize: 16,
            }}>×</button>
          </div>

          {/* 색상 */}
          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={{ marginBottom: 4, color: '#666' }}>기본 색상</div>
            <input 
              type="color" 
              value={tweaks.primaryColor} 
              onChange={e => update({ primaryColor: e.target.value })}
              style={{ width: '100%', height: 32 }}
            />
          </label>

          {/* 글자 크기 슬라이더 */}
          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={{ marginBottom: 4, color: '#666' }}>글자 크기 ({tweaks.fontSize}px)</div>
            <input 
              type="range" 
              min={12} max={24} step={1}
              value={tweaks.fontSize}
              onChange={e => update({ fontSize: +e.target.value })}
              style={{ width: '100%' }}
            />
          </label>

          {/* 밀도 옵션 */}
          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={{ marginBottom: 4, color: '#666' }}>밀도</div>
            <select 
              value={tweaks.density}
              onChange={e => update({ density: e.target.value })}
              style={{ width: '100%', padding: 6 }}
            >
              <option value="compact">콤팩트</option>
              <option value="comfortable">편안</option>
              <option value="spacious">넓음</option>
            </select>
          </label>

          {/* 다크 모드 토글 */}
          <label style={{ 
            display: 'flex', 
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
          }}>
            <input 
              type="checkbox" 
              checked={tweaks.dark}
              onChange={e => update({ dark: e.target.checked })}
            />
            <span>다크 모드</span>
          </label>

          <button onClick={reset} style={{
            width: '100%',
            padding: '8px 12px',
            background: '#f5f5f5',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
          }}>재설정</button>
        </div>
      ) : (
        <button 
          onClick={() => setOpen(true)}
          style={{
            background: '#1A1A1A',
            color: 'white',
            border: 'none',
            borderRadius: 999,
            padding: '10px 16px',
            fontSize: 12,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >⚙ Tweaks</button>
      )}
    </div>
  );
}
```
### Tweaks 적용하기

메인 컴포넌트에서 Tweaks를 사용합니다:```jsx
function App() {
  const { tweaks } = useTweaks();

  return (
    <div style={{
      '--primary': tweaks.primaryColor,
      '--font-size': `${tweaks.fontSize}px`,
      background: tweaks.dark ? '#0A0A0A' : '#FAFAFA',
      color: tweaks.dark ? '#FAFAFA' : '#1A1A1A',
    }}>
      {/* 여기에 내용 */}
      <TweaksPanel />
    </div>
  );
}
```
CSS에서 변수 사용:```css
button.cta {
  background: var(--primary);
  color: white;
  font-size: var(--font-size);
}
```
## 전형적인 Tweak 옵션

다양한 유형의 디자인에 추가할 Tweak 항목:

### 공통
- 주색상 (color picker)
- 글자 크기 (slider 12-24px)
- 서체 (select: display font vs body font)
- 다크 모드 (toggle)

### 슬라이드 덱
- 테마 (light/dark/brand)
- 배경 스타일 (solid/gradient/image)
- 폰트 대비 (장식적 vs 절제됨)
- 정보 밀도 (minimal/standard/dense)

### 제품 프로토타입
- 레이아웃 변형 (layout A / B / C)
- 인터랙션 속도 (animation speed 0.5x-2x)
- 데이터 양 (mock 데이터 개수 5/20/100)
- 상태 (empty/loading/success/error)

### 애니메이션
- 속도 (0.5x-2x)
- 루프 (once/loop/ping-pong)
- Easing (linear/easeOut/spring)

### 랜딩 페이지
- Hero 스타일 (image/gradient/pattern/solid)
- CTA 문구 (몇 가지 변형)
- 구조 (single column / two column / sidebar)

## Tweaks 디자인 원칙

### 1. 의미 있는 옵션, 사용자를 번거롭게 하지 않는 것

각 Tweak은 반드시 **실제적인 디자인 선택지**를 보여주어야 합니다. 아무도 실제로 전환하지 않을 법한 Tweak은 추가하지 마세요 (예: border-radius 0-50px 슬라이더 — 사용자가 조절해 봐도 중간값들은 모두 어색해 보일 뿐입니다).

좋은 Tweak은 **이산적이고 고민이 담긴 변형(variations)**을 노출합니다:
- "라운드 스타일": 라운드 없음 / 약한 라운드 / 강한 라운드 (세 가지 옵션)
- 나쁜 예: "라운드": 0-50px 슬라이더

### 2. 적을수록 좋다 (Less is more)

하나의 디자인에 대한 Tweaks 패널은 **최대 5~6개**의 옵션으로 제한하세요. 그 이상은 "설정 페이지"가 되어버려, 신속하게 변형을 탐색한다는 의미를 잃게 됩니다.

### 3. 기본값은 완성된 디자인이어야 함

Tweaks는 **금상첨화**여야 합니다. 기본값 그 자체로 이미 완성되고 배포 가능한 디자인이어야 합니다. 사용자가 Tweaks 패널을 닫았을 때 보이는 것이 바로 최종 결과물이어야 합니다.

### 4. 합리적인 그룹화

옵션이 많을 때는 그룹을 나누어 표시합니다:```
---- 시각 ----
기본 색상 | 글자 크기 | 다크 모드

---- 레이아웃 ----
밀도 | 사이드바 위치

---- 내용 ----
표시 데이터 양 | 상태
```
## 소스 코드 레벨 퍼시스턴스 호스트를 위한 전방 호환성

향후 설계를 소스 코드 레벨 트윅(tweaks)을 지원하는 환경(예: Claude.ai Artifacts)에 업로드하여 실행하려는 경우, **EDITMODE 마커 블록**을 유지하세요:```jsx
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "primaryColor": "#D97757",
  "fontSize": 16,
  "density": "comfortable",
  "dark": false
}/*EDITMODE-END*/;
```
마커 블록은 localStorage 방식에서는 **아무런 역할이 없으며**(단순한 일반 주석), 소스 코드 쓰기(write-back)를 지원하는 호스트에서는 읽혀서 소스 코드 수준의 지속성을 구현합니다. 이를 추가하는 것은 현재 환경에 무해하며, 동시에 향후 호환성을 유지합니다.

## 자주 묻는 질문

**Tweaks 패널이 디자인 내용을 가림**
→ 닫을 수 있게 만듭니다. 기본적으로 닫혀 있으며, 작은 버튼을 표시하여 사용자가 클릭했을 때만 펼쳐지도록 합니다.

**사용자가 tweaks를 전환한 후 설정을 반복해야 함**
→ 이미 localStorage를 사용 중입니다. 새로고침 후에도 유지되지 않는다면 localStorage를 사용할 수 있는지 확인하세요(시크릿 모드에서는 실패하므로 catch가 필요합니다).

**여러 HTML 페이지에서 tweaks를 공유하고 싶음**
→ localStorage 키에 project name을 추가합니다:`design-tweaks-[projectName]`.

**tweak 간에 연동 관계를 설정하고 싶습니다**
→`update`안에 로직 추가:```jsx
const update = (patch) => {
  let next = { ...tweaks, ...patch };
  // 연동: dark mode 선택 시 자동으로 글자 색상을 전환
  if (patch.dark === true && !patch.textColor) {
    next.textColor = '#F0EEE6';
  }
  setTweaks(next);
  localStorage.setItem(...);
};
```
