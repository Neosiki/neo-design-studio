/**
 * narration_stage.jsx · 내레이션 구동 Stage
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  🛑 이 도구 사용 전 필독: references/voiceover-pipeline.md         ║
 * ║                                                                  ║
 * ║  철칙 #1: 전체는 연속적인 운동 서사로, 독립된 장면들의 집합이 아니다             ║
 * ║          You are not making 7 slides. You are directing 1 movie. ║
 * ║                                                                  ║
 * ║  철칙 #2: 선택한 hero element는 scene을 가로질러 계속 존재해야 하며, 매 구간마다 새 레이아웃을 만들지 마세요║
 * ║                                                                  ║
 * ║  철칙 #3: scene 간에 하드 컷(불투명도 1→0/0→1)을 금지한다                  ║
 * ║          morph 할 것, cut 하지 말 것                                      ║
 * ║                                                                  ║
 * ║  실패 패턴 #1 (이 스킬 v1 실전 함정):                           ║
 * ║          각 Scene이 각각 독립적인 layout + cue를 가지고 fade-up + scene 전환을 사용함║
 * ║          전체 페이지 불투명도 전환 = 내레이션 있는 PowerPoint = 질감이 사라짐       ║
 * ║                                                                  ║
 * ║  올바른 방법: hero를 직접 <NarrationStage>의 자식으로 배치( Scene 안으로 들이지 말 것)  ║
 * ║          useNarration()로 hero 내부에서 time/scene/cue 상태를 읽음      ║
 * ║          hero 스스로 현재 시간에 따라 형태를 결정 → scene을 가로질러 연속적으로 움직임       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * 사용법(HTML에 inline으로 <script type="text/babel">로 삽입):
 *   const { NarrationStage, Scene, Cue, useNarration } = NarrationStageLib;
 *
 *   const App = () => (
 *     <NarrationStage timeline={TIMELINE} audioSrc="voiceover.mp3"
 *                     width={1920} height={1080}>
 *       <Scene id="intro">
 *         <h1>token이란 무엇인가</h1>
 *         <Cue id="question">
 *           {(triggered) => triggered && <p>↑ 이것이 질문입니다</p>}
 *         </Cue>
 *       </Scene>
 *       <Scene id="token-2">
 *         <Cue id="split">
 *           {(triggered, progress) => (
 *             <div style={{opacity: triggered ? 1 : 0.3}}>...</div>
 *           )}
 *         </Cue>
 *       </Scene>
 *     </NarrationStage>
 *   );
 *
 * 시간 소스(자동으로 둘 중 하나 선택):
 *   - 녹화 모드(window.__recording === true): window.__time 사용(외부 driver가 프레임을 밀어줌)
 *   - 실시간 재생 모드: <audio>의 currentTime 사용(사용자가 재생을 누를 때 오디오와 엄격히 동기화)
 *
 * render-video.js와 호환:
 *   - tick의 첫 프레임에서 window.__ready = true로 설정
 *   - 녹화 시 window.__recording을 감지해 audio 재생을 강제 비활성화하고 window.__time 사용
 *   - window.__totalDuration을 드라이버에 노출해 전체 프레임 수 계산에 사용
 *
 * 의존: React 18 + ReactDOM 18 + Babel standalone(animations.jsx와 동일)
 */

const NarrationStageLib = (() => {
  const NarrationContext = React.createContext({
    time: 0,
    scene: null,
    sceneTime: 0,
    isCueTriggered: () => false,
    cueProgress: () => 0,
  });

  /**
   * 주요 컴포넌트: timeline + audio를 받아 context 제공
   *
   * Props:
   *   timeline       timeline.json 객체(필수)
   *   audioSrc       voiceover.mp3 경로(필수)
   *   width/height   Stage 크기, 기본 1920x1080
   *   background     기본 '#0e0e0e'
   *   controls       하단 재생바 표시 여부, 기본 true
   *   children       애니메이션 내용(<Scene>/<Cue>로 구성)
   */
  function NarrationStage({
    timeline,
    audioSrc,
    width = 1920,
    height = 1080,
    background = '#0e0e0e',
    controls = true,
    children,
  }) {
    const audioRef = React.useRef(null);
    const [time, setTime] = React.useState(0);
    const [playing, setPlaying] = React.useState(false);
    const recording = typeof window !== 'undefined' && window.__recording === true;

    // render-video.js에 노출
    React.useEffect(() => {
      if (typeof window === 'undefined') return;
      window.__totalDuration = timeline.totalDuration;
      window.__ready = true;
    }, [timeline.totalDuration]);

    // 시간 tick
    React.useEffect(() => {
      let raf;
      if (recording) {
        // Seek-render(render-video-seek.js가 window.__seekRender를 주입): 자체 구동 시계를 동결,
        // 외부의 window.__seek(t)가 프레임별로 진행. 각 프레임은 결정적 seek이며 rAF를 사용하지 않음.
        if (typeof window !== 'undefined' && window.__seekRender) {
          window.__seek = (t) => setTime(Math.min(t, timeline.totalDuration));
          return;
        }
        // 녹화 모드: rAF wall-clock이 자체 구동하여 0에서 시작
        // render-video.js와 호환(애니메이션 자연 진행 + window.__seek 리셋에 의존)
        let startedAt = null;
        const tick = (now) => {
          if (startedAt === null) startedAt = now;
          setTime(Math.min((now - startedAt) / 1000, timeline.totalDuration));
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        // ready 후 render-video.js가 __seek(0)을 호출해 리셋할 수 있도록 __seek 노출
        if (typeof window !== 'undefined') {
          window.__seek = (t) => {
            startedAt = performance.now() - t * 1000;
            setTime(t);
          };
        }
      } else {
        // 실시간 재생 모드: audio.currentTime을 따름
        const tick = () => {
          if (audioRef.current && !audioRef.current.paused) {
            setTime(audioRef.current.currentTime);
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      }
      return () => cancelAnimationFrame(raf);
    }, [recording, timeline.totalDuration]);

    // 현재 scene
    const currentScene = React.useMemo(() => {
      if (!timeline.scenes) return null;
      // start <= time < end인 구간을 찾음. 마지막 구간은 end까지 유지
      for (let i = 0; i < timeline.scenes.length; i++) {
        const s = timeline.scenes[i];
        const next = timeline.scenes[i + 1];
        if (time >= s.start && (!next || time < next.start)) return s;
      }
      return timeline.scenes[0];
    }, [time, timeline.scenes]);

    const sceneTime = currentScene ? Math.max(0, time - currentScene.start) : 0;

    // cue 상태 찾기(absoluteTime으로 비교, scene을 넘어서도 조회 가능)
    const allCues = React.useMemo(() => {
      const map = {};
      for (const s of timeline.scenes || []) {
        for (const c of s.cues || []) {
          map[c.id] = c;
        }
      }
      return map;
    }, [timeline.scenes]);

    const isCueTriggered = React.useCallback(
      (cueId) => {
        const c = allCues[cueId];
        if (!c) return false;
        return time >= c.absoluteTime;
      },
      [allCues, time],
    );

    /** 트리거된 후 몇 초 동안 0→1, >1 이후 1을 유지. cue 이후 페이드인 애니메이션에 사용 */
    const cueProgress = React.useCallback(
      (cueId, ramp = 0.5) => {
        const c = allCues[cueId];
        if (!c) return 0;
        const dt = time - c.absoluteTime;
        if (dt <= 0) return 0;
        if (dt >= ramp) return 1;
        return dt / ramp;
      },
      [allCues, time],
    );

    const ctx = { time, scene: currentScene, sceneTime, isCueTriggered, cueProgress, timeline };

    // 재생/일시정지/시크 제어
    const handlePlayPause = () => {
      if (!audioRef.current) return;
      if (audioRef.current.paused) {
        audioRef.current.play();
        setPlaying(true);
      } else {
        audioRef.current.pause();
        setPlaying(false);
      }
    };

    const handleSeek = (e) => {
      if (!audioRef.current) return;
      const t = parseFloat(e.target.value);
      audioRef.current.currentTime = t;
      setTime(t);
    };

    const handleAudioEnded = () => setPlaying(false);

    return (
      <NarrationContext.Provider value={ctx}>
        <div
          style={{
            position: 'relative',
            width,
            height,
            background,
            overflow: 'hidden',
            color: '#fff',
            fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
          }}
        >
          {children}
        </div>
        {!recording && (
          <audio
            ref={audioRef}
            src={audioSrc}
            preload="auto"
            onEnded={handleAudioEnded}
          />
        )}
        {!recording && controls && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              background: '#1a1a1a',
              color: '#ddd',
              fontFamily: 'monospace',
              fontSize: 13,
              width,
              boxSizing: 'border-box',
            }}
          >
            <button
              onClick={handlePlayPause}
              style={{
                padding: '6px 14px',
                background: '#fff',
                color: '#000',
                border: 0,
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {playing ? '❚❚ Pause' : '▶ Play'}
            </button>
            <input
              type="range"
              min={0}
              max={timeline.totalDuration}
              step={0.01}
              value={time}
              onChange={handleSeek}
              style={{ flex: 1 }}
            />
            <span style={{ minWidth: 110, textAlign: 'right' }}>
              {time.toFixed(2)} / {timeline.totalDuration.toFixed(2)}s
            </span>
            <span
              style={{
                padding: '4px 10px',
                background: '#2a2a2a',
                borderRadius: 4,
                minWidth: 100,
                textAlign: 'center',
              }}
            >
              {currentScene ? currentScene.id : '—'}
            </span>
          </div>
        )}
      </NarrationContext.Provider>
    );
  }

  /**
   * Scene 래퍼: 지정된 scene id가 활성일 때만 children 렌더링
   *
   * Props:
   *   id        scene id(timeline.scenes[].id에 대응)
   *   children  렌더링 내용; ReactNode 또는 (sceneTime, sceneInfo) => ReactNode일 수 있음
   *   keepMounted 기본 false. true로 설정하면 항상 마운트 상태를 유지하고 visibility만 전환(애니메이션 연속성을 위해 사용)
   */
  function Scene({ id, children, keepMounted = false }) {
    const { scene, sceneTime } = React.useContext(NarrationContext);
    const isActive = scene && scene.id === id;
    if (!isActive && !keepMounted) return null;
    const content = typeof children === 'function' ? children(sceneTime, scene) : children;
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: isActive ? 1 : 0,
          pointerEvents: isActive ? 'auto' : 'none',
          transition: keepMounted ? 'opacity 0.2s' : undefined,
        }}
      >
        {content}
      </div>
    );
  }

  /**
   * Cue 래퍼: cue 트리거 상태를 관찰
   *
   * Props:
   *   id        cue id(timeline.scenes[].cues[].id에 대응)
   *   ramp      cue 트리거 후 progress가 0→1로 변화하는 ramp 시간(초), 기본 0.5
   *   children  반드시 함수여야 함: (triggered: bool, progress: 0-1) => ReactNode
   */
  function Cue({ id, ramp = 0.5, children }) {
    const { isCueTriggered, cueProgress } = React.useContext(NarrationContext);
    const triggered = isCueTriggered(id);
    const progress = cueProgress(id, ramp);
    return children(triggered, progress);
  }

  /** Hook: 사용자 정의 컴포넌트에서 직접 narration 상태를 가져옴 */
  function useNarration() {
    return React.useContext(NarrationContext);
  }

  /**
   * splitChunkToLines · 문장을 구두점 기준으로 잘라 ≤maxLen 글자의 짧은 행으로 만듦
   *
   * 자막 표시용——B 사이트 표준은 한 줄 ≤12글자로 읽기 쉬움. 이 함수:
   * 1. 먼저 강한 구두점(。！？\n)으로 문장 분리, 절대 문장부호를 넘겨 잘라내지 않음
   * 2. 각 문장이 ≤ maxLen이면 그대로 사용, 아니면 약한 구두점(，、；：)으로 분할해 병합
   * 3. 중영혼합: 영어/숫자는 시각적 폭을 0.5글자로 계산
   * 4. 최후 수단 하드 컷(희귀: 단일 구두점 구간이 maxLen을 초과할 때)
   *
   * @param text   원문
   * @param maxLen 단행 최대 시각 길이, 기본 13（≈12 글자 + 구두점 1개）
   * @returns 잘린 자막 행 배열
   */
  function visualLen(s) {
    let n = 0;
    for (const ch of s) n += /[a-zA-Z0-9 .,'":;\-]/.test(ch) ? 0.5 : 1;
    return n;
  }
  function splitChunkToLines(text, maxLen = 13) {
    const lines = [];
    const sentences = [];
    let buf = '';
    for (const ch of text) {
      buf += ch;
      if ('。！？\n'.includes(ch)) { if (buf.trim()) sentences.push(buf.trim()); buf = ''; }
    }
    if (buf.trim()) sentences.push(buf.trim());
    for (const sent of sentences) {
      if (visualLen(sent) <= maxLen) { lines.push(sent); continue; }
      const parts = [];
      let pbuf = '';
      for (const ch of sent) {
        pbuf += ch;
        if ('，、；：'.includes(ch)) { parts.push(pbuf); pbuf = ''; }
      }
      if (pbuf) parts.push(pbuf);
      let merged = '';
      for (const p of parts) {
        if (visualLen(merged) + visualLen(p) <= maxLen) merged += p;
        else { if (merged) lines.push(merged); merged = p; }
      }
      if (merged) {
        if (visualLen(merged) <= maxLen) lines.push(merged);
        else {
          let hbuf = '';
          for (const ch of merged) { hbuf += ch; if (visualLen(hbuf) >= maxLen) { lines.push(hbuf); hbuf = ''; } }
          if (hbuf) lines.push(hbuf);
        }
      }
    }
    return lines.filter(l => l.trim());
  }

  /**
   * Subtitles · B 사이트 스타일 자막 컴포넌트(흰색 광륜과 짙은 먹색 글자, 배경 없음, chunks 시간에 따라 표시)
   *
   * 자동으로 현재 scene.chunks에서 활성 chunk를 가져와 splitChunkToLines로 짧은 행으로 분할,
   * 글자 수 비례로 chunk 시간창을 각 행의 표시 시간에 할당.
   *
   * 필수: timeline.scenes[].chunks[](narrate-pipeline.mjs가 기본으로 출력)
   *
   * Props(기본 스타일 덮어쓰기 가능):
   *   bottom    하단에서의 거리(픽셀), 기본 90(가장자리에 붙이지 않음)
   *   fontSize  글자 크기, 기본 32
   *   color     글자색, 기본 짙은 먹 #1a1a1a(연한 종이색 배경에 적합)
   *   haloColor 광륜색, 기본 rgba(245,241,232,0.9)(#f5f1e8 배경에 적합)
   *   maxLen    한 줄 최대 시각 길이, 기본 13
   *
   * 어두운 배경 장면: color를 '#fff'로, haloColor를 'rgba(0,0,0,0.85)'로 변경하면 됨。
   *
   * 카라오케 모드(글자 단위 하이라이트, timeline chunks에 words 필요——narrate-pipeline.mjs가 기본 출력):
   *   karaoke       true로 활성화, 기본 false. 한 줄 전체를 표시하며 읽을 때 해당 글자만 색이 바뀜
   *   karaokeColor  읽은 글자의 색, 기본 브랜드 오렌지 '#e8590c'
   *   chunk에 words 데이터가 없으면 자동으로 일반 chunk 모드로 폴백되며 호출자는 별도 판단 필요 없음.
   *   주의: words는 TN 이후의 텍스트(예: "2025"→"\u4e8c\u96f6\u4e8c\u4e94"), 카라오케 행은 words로 직접 조립,
   *   하이라이트가 발음과 엄격히 정렬되도록 보장( chunk.text 원문과 차이가 있을 수 있음).
   */
  function splitWordsToLines(words, maxLen = 13) {
    // 글자 단위 타임스탬프 토큰을 탐욕적으로 ≤maxLen 행으로 묶음; 강한 구두점(。！？) 뒤에는 강제 줄바꿈, 절대 문장부호를 넘지 않음
    const lines = [];
    let cur = [];
    let curLen = 0;
    for (const w of words) {
      const wLen = visualLen(w.text);
      if (cur.length > 0 && curLen + wLen > maxLen) { lines.push(cur); cur = []; curLen = 0; }
      cur.push(w);
      curLen += wLen;
      if (/[。！？]\s*$/.test(w.text)) { lines.push(cur); cur = []; curLen = 0; }
    }
    if (cur.length > 0) lines.push(cur);
    return lines;
  }

  function Subtitles({ bottom = 90, fontSize = 32, color = '#1a1a1a', haloColor = 'rgba(245,241,232,0.9)', maxLen = 13, karaoke = false, karaokeColor = '#e8590c' } = {}) {
    const { time, scene } = React.useContext(NarrationContext);
    if (!scene || !scene.chunks) return null;
    const active = scene.chunks.find(c => time >= c.absoluteStart && time < c.absoluteEnd);
    if (!active) return null;

    // —— 카라오케 모드：한 줄 전체 표시 + 글자별 하이라이트(읽는 즉시 색 변경, CSS transition 없음, seek 렌더링 결정적)——
    if (karaoke && active.words && active.words.length > 0) {
      const wordLines = splitWordsToLines(active.words, maxLen);
      let activeWLine = wordLines[0];
      for (const ln of wordLines) {
        if (time >= ln[0].absoluteStart) activeWLine = ln;
        else break;
      }
      const lineStart = activeWLine[0].absoluteStart;
      const lineProg = Math.max(0, Math.min(1, (time - (lineStart - 0.15)) / 0.15)); // 행은 0.15s 앞서 페이드 인
      return React.createElement('div', {
        style: { position: 'absolute', left: 0, right: 0, bottom, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 50 },
      }, React.createElement('div', {
        key: lineStart,
        style: {
          fontFamily: '"PingFang SC", "Noto Sans SC", -apple-system, sans-serif',
          fontSize, fontWeight: 600,
          letterSpacing: '0.04em', lineHeight: 1.2, textAlign: 'center',
          textShadow: `0 0 6px ${haloColor}, 0 0 12px ${haloColor}, 0 1px 2px rgba(255,255,255,0.5)`,
          opacity: lineProg, transform: `translateY(${(1 - lineProg) * 4}px)`,
        },
      }, activeWLine.map((w, i) => React.createElement('span', {
        key: i,
        style: { color: time >= w.absoluteStart ? karaokeColor : color },
      }, w.text))));
    }

    // —— 일반 chunk 모드(원래 동작, 변경 없음)——
    const lines = splitChunkToLines(active.text, maxLen);
    if (lines.length === 0) return null;
    const totalLen = lines.reduce((s, l) => s + visualLen(l), 0);
    const chunkDur = active.absoluteEnd - active.absoluteStart;
    let acc = active.absoluteStart;
    let activeLine = lines[lines.length - 1];
    let lineStart = active.absoluteStart;
    for (const line of lines) {
      const dur = (visualLen(line) / totalLen) * chunkDur;
      if (time < acc + dur) { activeLine = line; lineStart = acc; break; }
      acc += dur;
    }
    const lineProg = Math.min(1, (time - lineStart) / 0.15);
    return React.createElement('div', {
      style: { position: 'absolute', left: 0, right: 0, bottom, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 50 },
    }, React.createElement('div', {
      key: lineStart,
      style: {
        fontFamily: '"PingFang SC", "Noto Sans SC", -apple-system, sans-serif',
        fontSize, fontWeight: 600, color,
        letterSpacing: '0.04em', lineHeight: 1.2, textAlign: 'center',
        textShadow: `0 0 6px ${haloColor}, 0 0 12px ${haloColor}, 0 1px 2px rgba(255,255,255,0.5)`,
        opacity: lineProg, transform: `translateY(${(1 - lineProg) * 4}px)`,
      },
    }, activeLine));
  }

  /**
   * useSceneFade · scene 내부 보조 요소의 부드러운 페이드 인/아웃 헬퍼
   *
   * 철칙 #2는 scene 간 하드 컷을 금지하지만——scene 내부의 보조 요소(데이터 카드, 인용 블록)
   * 한 번 cue가 트리거되면 기본적으로 scene 종료까지 계속 표시됨. 페이드아웃하지 않으면 이 구간을 떠나 다음 구간으로 진입할 때
   * 이러한 요소들이 갑작스럽게 남아있거나 순간적으로 사라지는 것을 방지. 이 훅은 [입장 페이드인 → 유지 → 퇴장 페이드아웃]의 통일된 부드러운 전환을 제공함.
   *
   * 사용법(op를 보조 요소의 opacity에 곱함):
   *   const op = useSceneFade('md-side', 0.6, 0.8);  // 입장 0.6s, 퇴장 0.8s
   *   <Cue id="agents-md">{(t, p) => (
   *     <div style={{ opacity: op * p }}>...</div>
   *   )}</Cue>
   *
   * 이렇게 데이터 카드가 md-side 구간 시작 후 0.6s 내에 페이드인하고, 구간 종료 전 0.8s부터 페이드아웃을 시작,
   * 다음 구간의 보조 요소 페이드인과 오버랩을 형성해 화면에 하드 컷이 발생하지 않음.
   *
   * @param sceneId  scene id
   * @param fadeIn   입장 페이드인 시간(초)(기본 0.5)
   * @param fadeOut  퇴장 페이드아웃 시간(초)(기본 0.5)
   * @returns 0-1 사이의 불투명도 배율
   */
  function useSceneFade(sceneId, fadeIn = 0.5, fadeOut = 0.5) {
    const { time, timeline } = React.useContext(NarrationContext);
    if (!timeline) return 0;
    const s = timeline.scenes.find(x => x.id === sceneId);
    if (!s) return 0;
    const inT = (time - s.start) / fadeIn;
    const outT = (s.end - time) / fadeOut;
    const v = Math.min(1, Math.min(inT, outT));
    return Math.max(0, v);
  }

  return { NarrationStage, Scene, Cue, useNarration, useSceneFade, Subtitles, splitChunkToLines, splitWordsToLines };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { NarrationStageLib });
}
