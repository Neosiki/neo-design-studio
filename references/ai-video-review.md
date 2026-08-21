# AI 시사 검수 루프 (scripts/cloud/ai-review-video.py)

> 최종 렌더 MP4를 영상 이해 모델 (seed-2.0-lite)에 넣고, 고정된 checklist에 따라 구조화된 검수 리포트를 받는다.
> 위치: **최종 렌더 후, 납품 전**의 마지막 품질 검사다. 사람이 전편을 다시 보는 일을 대신한다. 프레임 단위로 훑는 verify-video.sh를 대신하지는 않는다.
> ⚠️ 선택형 클라우드 기능: 압축한 영상 조각이 화산방주(Volcengine Ark) 공식 엔드포인트 (ark.cn-beijing.volces.com)로 전송된다.
> 본인 ARK_API_KEY를 쓰며,`--yes` 또는 `DESIGN_CLOUD_OK=1`로 명시적으로 확인해야 한다. 저장소 루트의 `SECURITY.md` 참고.
> 클라우드를 쓰고 싶지 않으면: `scripts/verify-video.sh`로 프레임을 뽑아 직접 본다. 전 과정이 로컬이다.

## 언제 쓰나

- 최종 60fps 완성본이 나온 뒤, 납품·믹싱 전에 한 번 돌린다
- SFX 믹싱본이 나오면 한 번 더 돌린다（onset 대조는 오디오 트랙이 있을 때만 동작한다）
- 큰 문제를 고쳐 다시 렌더한 뒤 재검수
- 테스트 렌더 30fps 단계에서는 돌리지 않는다（해상도·리듬이 아직 정해지지 않아 호출만 낭비한다）

## 어떻게 쓰나

```bash
cd 프로젝트디렉터리 && unset ALL_PROXY   # 스크립트 자체가 프록시를 타지 않지만 unset은 이중 안전장치
uv run ~/.claude/skills/design-studio/scripts/cloud/ai-review-video.py \
  --video 완성본.mp4 \
  --context 연출노트.md \    # 꼭 넣기를 권한다: 모델이 이걸로 「의도한 설계」와 「버그」를 가른다
  --yes                      # 영상 조각을 Volcengine Ark로 보내는 데 동의（또는 DESIGN_CLOUD_OK=1）
```

- ARK_API_KEY는 skill 루트의 `.env`（이미 gitignore 처리）나 환경변수에 둔다. 스크립트는 이 변수 하나만 읽는다

- 리포트 저장 위치: 영상과 같은 디렉터리의 `<영상명>-AI심사.md`（`--output`으로 바꿀 수 있다）
- `--segment-len` 기본값은 60초 단위. `--model` 기본값은 doubao-seed-2-0-lite-260215
- 210초 영상 실측: API 호출 6회, 6~10분, 토큰 약 18만 in / 2만 out（lite 등급이라 비용은 몇 원 수준）

## 호출 구조（3층 혼합. 순수 모델이 아니다）

1. **ffmpeg 객관 검출**（결정론적이라 놓치지 않는다）:
   - `silencedetect` → 효과음 onset 시간표（모델은 영상의 오디오 트랙을 **듣지 못한다**. 2026-07-17 실측）
   - `freezedetect`→ 3초 이상 완전 정지 구간 목록
2. **모델 구간별 시청**: 60초/구간으로 압축해 보낸다（1280 너비/15fps/crf28, 플랫한 애니메이션은 분당 약 0.5MB）.
   구간마다 prompt에 checklist + 연출노트 + 그 구간의 onset·정지 구간 데이터가 들어가고, 시각은 원본 영상 기준으로 환산한다
3. **모델 전편 저화질 pass**: 960 너비/10fps로 전편을 따로 보내, 구간을 넘는 서사 연결·hero 관통·전체 리듬만 본다
4. 텍스트 종합 call이 ①-⑧로 합친다. 구간별 원본 기록과 객관 검출 데이터는 전부 리포트 부록에 남는다

## checklist와 심각도

①검은 프레임/렌더 누락 ②글자 잘림/오타 ③요소 겹침·가림 ④서사 연결（전환은 camera-language.md §7의 3층 어휘로 분류한다: 6식[백색 플래시/암전 통과/초점 이월/블랙 타이틀 카드/whip-pan/mask-wipe], hidden-cut, travel[공유 요소 자리 이동/글자 카운터 통과]. 생컷=아무 포장도 없는 하드컷은 ⚡로 기록）
⑤hero 관통성 ⑥리듬 죽은 구간（객관 목록 + 의도한 hold인지 정말 죽은 구간인지 모델 판단）⑦효과음 타이밍（onset과 화면 이벤트 대조）
⑧구도 불균형/빈 공간

⚠️치명=납품 전 필수 수정 | ⚡중요=체감이 눈