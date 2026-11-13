# 실행·영상 출력

명령의 `SKILL`은 이 선화 스킬 폴더의 절대 경로다. 프로젝트와 스킬 폴더를 혼동하지 않는다.

```powershell
node "$SKILL/scripts/line-art.mjs" doctor
node "$SKILL/scripts/line-art.mjs" init "D:/작업/새_선화장면"
```

프로젝트 폴더에서 `npm ci --ignore-scripts` 후 `npm run typecheck`, `npm run build`를 실행한다.
개발 서버를 `npm run dev -- --host 127.0.0.1`로 시작한다. 포트가 바뀌면 실제 포트를 사용한다.
도우미와 원본은 Node 22.18 이상을 사용한다. Node·npm 실행 비용과 별개로 사용 중인 AI 요금제·사용량은 적용된다.

## Windows / macOS / Linux

`doctor`가 Node·Chrome·FFmpeg·FFprobe를 검사한다. Windows는 Program Files와 LocalAppData의 일반 크롬 위치도 찾는다.
탐색 실패 시 PowerShell에서 실제 설치 경로를 지정한다.

```powershell
$env:CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
```

원본 `frames.sh`는 Bash 전용이므로 PowerShell에서 그대로 실행하지 않는다. 필요하면 FFmpeg 명령을 직접 사용하거나 사용자가 설치한 Bash에서 실행한다.
상시 사용하는 로그인 크롬 프로필을 캡처에 연결하지 않는다. 출력 폴더 안의 별도 프로필로 실행한다.

## 캡처와 MP4

URL에는 `debug`가 필요하다. 아래 예제의 900프레임/30fps는 30초다. 기존 출력 폴더·파일은 덮어쓰지 않는다.

```powershell
node "$SKILL/scripts/line-art.mjs" capture "http://127.0.0.1:5173/examples/walker/?debug" "out/test-frames" 60 30 1920 1080
node "$SKILL/scripts/line-art.mjs" render "http://127.0.0.1:5173/examples/village/?debug&capture&day=30&start=0.3" "out/village-frames" 900 30 1920 1080 "out/village.mp4"
```

인코딩은 H.264·yuv420p MP4다. 짝수 폭·높이를 사용한다. 도우미는 15/30/60fps만 허용하며 일반 사용용 로컬 HTTP URL만 캡처한다.
출력 경로는 작업 폴더 기준이다. FFmpeg·FFprobe 경로는 PATH 또는 `FFMPEG`·`FFPROBE` 환경변수로 지정한다.
캡처 도중 실패하면 남은 프레임은 진단용이며 완성 영상이 아니다. 새 출력 폴더에서 다시 시작한다.

검증 예: `ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=width,height,nb_read_frames -of json out/village.mp4`.
검수용 접촉시트는 `ffmpeg -i out/village.mp4 -vf "fps=1/3.75,scale=480:-1,tile=4x2" -frames:v 1 out/contact.png`.

GIF는 필요한 경우 MP4에서 별도 제작한다. SVG 웹 결과의 반응 기능과 벡터 특성은 MP4/GIF에 유지되지 않는다.
