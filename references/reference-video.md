# 참조 영상 분석과 렌더 대조

기존 영상의 컷·자막 시점을 기록하거나 재구성한 영상의 차이를 찾을 때 사용한다. 11월 버전의 이 경로는 로컬 FFmpeg·FFprobe와 Design CLI를 사용한다. 분석할 권한이 있는 로컬 파일을 지정한다.

```powershell
node scripts/design/cli.mjs reference inspect "원본.mp4" --out "./원본검수"
node scripts/design/cli.mjs reference compare "원본.mp4" "렌더.mp4" --roi 0,800,1920,200 --out "./대조검수" --strict
node scripts/design/cli.mjs reference plan "원본.mp4" --srt "자막.srt" --out "./재구성초안"
node scripts/design/cli.mjs film check --dir "./재구성초안"
```

각 명령은 상위 디렉터리가 있는 새 결과 폴더에 쓴다. 영상당 180초·7,200프레임까지 처리한다. 긴 영상은 대조할 구간을 나누고 원본에서의 시작 시각을 따로 기록한다. 명령에는 FFmpeg와 FFprobe가 PATH에 있어야 한다.

| 명령 | 결과 | 확인할 점 |
|---|---|---|
| `inspect` | `reference.json`과 `reference.html` | 표시 해상도·회전·분수 fps·타임베이스·프레임 PTS, 컷과 한 프레임 플래시 후보, 샷 시작과 끝, 전후 프레임 |
| `compare` | `comparison.json`과 `comparison.html` | 길이·프레임 수, 시간 이동·누락·추가 이벤트, 화면 차이가 큰 프레임 쌍, 오디오 존재 여부와 시간 차이 추정 |
| `plan` | 분석 결과, `film-plan.json`, `film.html`, 샷별 HTML | 컷 후보를 기준으로 만든 재구성 초안. 샷 페이지의 자막과 텍스트를 편집할 수 있다. 검수 상태는 `pending`이다. |

프레임 번호는 0부터 시작하고 샷의 끝 프레임은 범위에서 제외한다. 표시 시각은 영상 첫 프레임 기준이다. 가변 프레임률에서는 각 프레임의 실제 PTS를 사용한다. 길이는 마지막 영상 프레임의 표시 종료 시각이며 오디오 트랙 길이와 구분한다.

### 무엇을 확인할지 정한다

- `--roi x,y,너비,높이`는 회전이 적용된 원본 화면의 픽셀 좌표다. 렌더 화면에서는 비율에 맞춰 영역을 변환한다. 자막 영역의 배경 움직임도 후보가 될 수 있으므로 전후 프레임을 본다. 컷·플래시로 분류한 경계의 영역 변화는 중복 집계에서 뺀다.
- `--srt`는 `inspect`와 `plan`에서 기존 자막의 문구와 시간을 가져온다. 큐는 원본의 표시 프레임으로 맞춘다. 원본에 굽힌 자막의 문구 인식·자동 전사는 별도 작업이다. 샷을 가로지르는 큐는 양쪽의 샷 내 시간으로 연결한다.
- 픽셀 차이는 96×54 RGB 표본의 정규화 평균이다. 기본 컷 기준은 0.26과 큰 변화 픽셀 40%, 자막 영역 기준은 0.045, 렌더 화면 차이 기준은 0.045다. 배경이 비슷한 점프컷·디졸브·작은 글자는 후보에서 빠질 수 있다. `--cut-threshold`, `--caption-threshold`, `--pixel-threshold`로 기준을 조정한다.
- 대조는 각 원본 프레임의 표시 시각에 렌더에서 표시되는 프레임을 선택한다. 같은 종류의 후보는 기본 150ms 범위에서 한 번씩 짝을 짓는다. 기본 이동 허용차는 두 영상 중 더 짧은 평균 프레임 간격의 절반이며 `--tolerance-ms`로 바꿀 수 있다. `--strict`는 관측한 차이가 있으면 보고서를 남기고 코드 4로 끝난다.
- 오디오는 앞 60초의 20ms 에너지 패턴을 ±1초 범위에서 비교하고 오디오 시작 시각 차이를 반영한다. 패턴이 모호하면 산정을 보류한다. 양수는 렌더의 소리가 늦다는 뜻이다.

### 초안에서 제작으로 넘어간다

샷 계획과 접촉시트에서 컷 후보를 확인한 뒤, 장면의 자막·카드·차트를 HTML로 만들고 사진·클립은 자산으로 연결한다. 이미 편집한 프로젝트에서는 새 결과 폴더의 계획을 참고해 필요한 샷만 반영한다. OpenFilm의 시간 계약과 NeoDesign의 `film snapshot`·`film check --baseline`으로 편집을 보호한다.

정밀한 HyperFrames 대조가 필요하면 설치 버전에서 `snapshot --against`와 `diff` 지원을 확인한다. 공식 Reverse의 HeyGen 재촬영은 별도 선택 경로다. 본 분석은 해당 서비스나 계정을 호출하지 않는다. [HyperFrames Reverse](https://github.com/heygen-com/hyperframes/blob/main/skills/reverse-any-video/SKILL.md) · [대조 가이드](https://github.com/heygen-com/hyperframes/blob/main/skills/reverse-any-video/references/match.md)

### 검증 명령

`npm run test:reference`는 합성 영상으로 분수 fps·가변 PTS·회전, 이벤트 지연과 누락, 오디오 지연, 자막·파일 경로 처리를 검사한다. FFmpeg 9.0 환경에서 18건이 통과했다. 이어 `npm run test:reference-browser`로 보고서 이미지와 모바일 폭, SRT 표시, 샷당 12개 시각의 두 순서 탐색을 확인한다. 브라우저에는 Playwright·Sharp·Chromium이 필요하다.
