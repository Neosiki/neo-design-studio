#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "requests>=2.28.0",
# ]
# ///
"""
AI 영상 검토 폐쇄 루프 —— 렌더된 애니메이션 MP4를 비디오 이해 모델（seed-2.0-lite）에 제공，
고정된 체크리스트에 따라 구간별로 검토 의뢰 + 전편 저화질 스캔 후，구조화된 markdown 검토 보고서로 집계。

⚠️ 선택적 클라우드 기능：압축된 완성본 클립을 화산방주(ark.cn-beijing.volces.com) 공식 인터페이스로 전송함（ark.cn-beijing.volces.com）
비디오 이해 리뷰를 수행하려면 본인의 ARK_API_KEY를 사용하세요. 최초 호출 시 --yes 또는 DESIGN_CLOUD_OK=1 필요
명시적 확인. 데이터 흐름 선언은 저장소 루트 SECURITY.md를 참조하세요. 로컬 무료 대안: scripts/verify-video.sh로 프레임 캡처 후 수동 확인.

Usage:
    uv run ai-review-video.py --video 완성편.mp4 --yes
    uv run ai-review-video.py --video 완성편.mp4 --context 감독대본.md --yes
    uv run ai-review-video.py --video 완성편.mp4 --segment-len 60 --output 보고서.md --yes

호출 흐름：
    1. ffprobe로 길이/오디오 트랙 탐지
    2. 오디오 트랙 있음 → ffmpeg silencedetect로 음향 onset 타임스탬프 추출（모델은 비디오 오디오 트랙을 듣지 못함，
       실측2026-07-17：input_video는 화면만 전달됨。음영상 정렬 검사=로컬 onset+모델의 화면 대조）
    3. --segment-len에 따라 분할하고 압축(너비 1280 / 15fps / crf28, 평면 애니메이션 약 0.5MB/분)
    4. 구간별 검토 의뢰（checklist①-⑧），각 구간 prompt에 원본 시간 범위 표기
    5. 전체 영상은 저해상도(너비 960 / 10fps)로 한 번 더 압축해 별도 심사 제출, 구간 간 서사 연속성 및 히어로(주체) 연속성 전용 확인
    6. 텍스트 집계 호출：체크리스트 항목별로 병합하여 최종 보고서 생성；구간별 원시 발견은 부록에 보존

API 키: 우선 환경변수 ARK_API_KEY를 읽고, 그 다음 skill 루트의 .env에서 해당 변수만 추출(이 변수만), 절대 하드코딩하지 않음
프록시: requests session의 trust_env를 False로 설정(로컬 시스템 프록시 설정을 상속하지 않음), ALL_PROXY 등 남은 프록시로 인한 TLS 오류에 면역
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from base64 import b64encode
from pathlib import Path

import requests

API_URL = "https://ark.cn-beijing.volces.com/api/v3/responses"
DEFAULT_MODEL = "doubao-seed-2-0-lite-260215"
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"  # skill 루트 .env（이미 gitignore됨）
MAX_SEGMENT_MB = 8  # 단일 분할 압축물이 이 값을 초과하면 한 단계 더 압축

CHECKLIST = """\
① 블랙프레임/빈 프레임/렌더링 누락: 전체 프레임 또는 넓은 영역의 검은 화면, 흰 화면, 요소가 렌더링되지 않음, 명백한 깨진 이미지
② 텍스트 문제: 자막 카드/레이블이 잘림, 컨테이너 넘침, 오탈자, 깨진 문자, 글자 겹침
③ 요소 겹침·가림: 겹치면 안 되는 요소들이 서로 가려짐, 레이어 순서 오류, 모델 관통(클리핑)
④ 서사 연속성: 장면 전환은 세 가지로 분류 — 하드컷(이전/다음 프레임이 전체적으로 급변하여 아무 연결도 없음),
   교차 페이드(구 장면의 투명도 점진적 감소)、morph（요소 연속 변형/이동으로 새 장면으로 전환）。
   보고 시 반드시 어떤 유형인지 명시，크로스페이드를 하드컷으로 오판하지 말 것；
   하드컷=⚡，크로스페이드가 감독 대본에서 morph가 요구될 때=💡『전환의 게으름』
⑤ 히어로/주체 연속성: 전편을 관통하는 주체 요소가 있다면 장면 전환에서 단절되거나 소실되거나 위치가 급변하는가
⑥ 리듬(정지) 구간: 아래의 '정지 구간 객관적 검사표' 참조(ffmpeg 프레임별 검사, ≥3초 완전 정지 구간).
   네 임무는 정지 구간을 단순히 찾는 것이 아니라 표의 각 구간에 대해 판단：의도된 hold（자막 카드 읽기/댓글 오버레이 정지/마무리 정지）
   정말 정지 구간인지(화면에 읽을 정보가 없으면서 정지). 의도적 홀드=보고하지 않거나 💡, 진짜 정지 구간=⚡
⑦ 효과음 타임스탬프(아래 onset 시간표 참조): 각 효과음 시간에 화면에서 대응하는 이벤트가 있는지 확인
⑧ 구성: 명백한 불균형, 넓은 무의미한 공백, 중요한 요소가 가장자리에 붙거나 구석으로 밀려남"""

SEVERITY_RULE = """\
심각도는 세 단계：
- ⚠️ 치명: 납품 전 반드시 수정(블랙프레임, 오탈자, 텍스트 잘림, 심각한 요소 겹침, 명백한 이미지 깨짐)
- ⚡ 중요: 시청감이 명백히 손상됨(하드컷 느낌, 히어로 단절, 3초 초과 정지 구간, 구도 명백한 불균형)
- 💡 제안: 더 나아질 수 있는 개선점"""


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def load_api_key():
    key = os.getenv("ARK_API_KEY")
    if not key and ENV_PATH.exists():
        # ARK_API_KEY 변수 하나만 추출하고 .env 전체 파일을 환경에 주입하지 않음
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("ARK_API_KEY") and "=" in line:
                key = line.split("=", 1)[1].strip().strip("'\"")
                break
    if not key or key.startswith("your_"):
        sys.exit("Error: ARK_API_KEY 미설정（skill 루트 .env 또는 환경변수），계속 실행 거부。검토 결과를 꾸며내지 않음。")
    return key


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"명령 실패: {' '.join(cmd)}\n{r.stderr[-2000:]}")
    return r


def probe(video: Path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-show_entries", "stream=codec_type", "-of", "json", str(video)])
    info = json.loads(r.stdout)
    duration = float(info["format"]["duration"])
    has_audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    return duration, has_audio


def detect_audio_onsets(video: Path, noise_db=-45, min_silence=0.3):
    """silencedetect로 음향 onset을 역추정。원본의 초 단위 리스트를 반환。"""
    r = subprocess.run(
        ["ffmpeg", "-i", str(video), "-af",
         f"silencedetect=noise={noise_db}dB:d={min_silence}", "-f", "null", "-"],
        capture_output=True, text=True)
    onsets = [round(float(m), 1) for m in
              re.findall(r"silence_end:\s*([\d.]+)", r.stderr)]
    # 오프닝에 비음이 아닐 때（시작부터 소리 있음）시 0을 보정
    starts = re.findall(r"silence_start:\s*([\d.-]+)", r.stderr)
    if starts and float(starts[0]) > min_silence:
        onsets.insert(0, 0.0)
    return onsets


def detect_static_segments(video: Path, noise=0.001, min_dur=3.0):
    """freezedetect로 ≥min_dur초 완전 정지 구간을 찾음。[(start,end)] 원본 초 단위 반환。"""
    r = subprocess.run(
        ["ffmpeg", "-i", str(video), "-vf",
         f"freezedetect=n={noise}:d={min_dur}", "-f", "null", "-"],
        capture_output=True, text=True)
    starts = re.findall(r"freeze_start:\s*([\d.]+)", r.stderr)
    durs = re.findall(r"freeze_duration:\s*([\d.]+)", r.stderr)
    return [(round(float(s), 1), round(float(s) + float(d), 1))
            for s, d in zip(starts, durs)]


def compress(src: Path, dst: Path, ss=None, t=None, width=1280, fps=15, crf=28):
    cmd = ["ffmpeg", "-y", "-v", "error"]
    if ss is not None:
        cmd += ["-ss", str(ss)]
    if t is not None:
        cmd += ["-t", str(t)]
    cmd += ["-i", str(src), "-vf", f"scale={width}:-2,fps={fps}",
            "-c:v", "libx264", "-crf", str(crf), "-preset", "veryfast",
            "-pix_fmt", "yuv420p", "-an", str(dst)]
    run(cmd)


def fmt_ts(sec: float) -> str:
    return f"{int(sec) // 60}:{int(sec) % 60:02d}"


def ask_model(session, api_key, model, prompt, video_path: Path | None = None, retries=1):
    content = []
    if video_path is not None:
        b64 = b64encode(video_path.read_bytes()).decode()
        content.append({"type": "input_video", "video_url": f"data:video/mp4;base64,{b64}"})
    content.append({"type": "input_text", "text": prompt})
    payload = {"model": model, "input": [{"role": "user", "content": content}]}
    last_err = None
    for attempt in range(retries + 1):
        try:
            resp = session.post(
                API_URL, json=payload, timeout=600,
                headers={"Authorization": f"Bearer {api_key}",
                         "Content-Type": "application/json"})
            if resp.status_code != 200:
                last_err = f"API {resp.status_code}: {resp.text[:500]}"
                continue
            data = resp.json()
            usage = data.get("usage", {})
            text = ""
            out = data.get("output")
            if isinstance(out, list):
                for item in out:
                    if isinstance(item, dict) and item.get("type") == "message":
                        for c in item.get("content", []):
                            if isinstance(c, dict) and c.get("type") == "output_text":
                                text += c.get("text", "")
            elif isinstance(out, str):
                text = out
            if not text:
                choices = data.get("choices", [])
                if choices:
                    text = choices[0].get("message", {}).get("content", "")
            if text:
                return text, usage
            last_err = f"응답에 텍스트 없음: {json.dumps(data, ensure_ascii=False)[:500]}"
        except requests.RequestException as e:
            last_err = f"네트워크 오류: {e}"
        if attempt < retries:
            log(f"  재시도（{last_err[:120]}）...")
            time.sleep(3)
    raise RuntimeError(last_err)


def segment_prompt(seg_start, seg_end, duration, context_text, onsets_in_seg,
                   statics_in_seg):
    p = [f"당신은 애니메이션 완성본 품질검사원，임무는 결점을 엄격히 찾아내는 것，작품을 과장하지 마십시오。",
         f"이 비디오는 총 길이{fmt_ts(duration)}인 애니메이션 완성본의 한 구간입니다，"
         f"원본 해당 구간 {fmt_ts(seg_start)}–{fmt_ts(seg_end)}。"
         f"구간 내 t초 = 원본 {fmt_ts(seg_start)}+t초，보고서에서는 일괄적으로 원본 시간（분:초）。"]
    if context_text:
        p.append("아래는 전편 감독대본（검토 컨텍스트，서사 의도와 무엇이 나와야 하는지 판단용）：\n"
                 "<감독대본>\n" + context_text + "\n</감독대본>")
    p.append("항목별로 아래 체크리스트를 점검，이 구간 내 발견만 보고：\n" + CHECKLIST)
    if statics_in_seg:
        ts = "、".join(f"{fmt_ts(a)}–{fmt_ts(b)}（{b - a:.1f}s）" for a, b in statics_in_seg)
        p.append(f"⑥의 정지구간 객관적 검사표（이 구간 내，원본 시간）：{ts}。각 항목을 의도된 hold인지 진짜 정지인지 판단。")
    else:
        p.append("이 구간에는 ≥3초 정지 구간이 없습니다. ⑥에는 바로 '미발견'이라고 쓰세요.")
    if onsets_in_seg:
        ts = "、".join(f"{fmt_ts(t)}({t}s)" for t in onsets_in_seg)
        p.append(f"⑦의 onset 시간표（이 구간 내 음향 실제 발생 원본 시간）：{ts}。"
                 f"소리를 들을 수 없으니, 이들 타임스탬프의 화면에서 효과음을 붙일 만한 이벤트가 있는지 확인하세요"
                 f"(전환/자막 카드 고정/충격/요소 등장), 대응 이벤트가 없는 타임스탬프=효과음 공백, 보고해야 합니다.")
    else:
        p.append("이 구간에서는 효과음 onset이 검출되지 않았습니다. ⑦은 건너뛰세요; 다만 이 구간에 강한 화면 이벤트가 있다면"
                 "(충격/자막 카드/전환)인데도 효과음이 덮여 있지 않다면, ⑦ 아래에 💡로 제안할 수 있습니다.")
    p.append(SEVERITY_RULE)
    p.append("출력 형식: markdown. ①-⑧ 항목별로, 각 항목 아래에 리스트 사용:\n"
             "- [원본 분:초] 심각도 이모지 구체적 설명\n"
             "해당 항목에 문제가 없으면 '미발견'이라고 쓰세요. 실제로 본 것만 보고하고, 불확실한 것은 '의심'으로 표기하세요. 꾸며내지 마세요.")
    return "\n\n".join(p)


def global_prompt(duration, context_text):
    p = ["당신은 애니메이션 완성본 품질검사원입니다。이것은 검토용 압축된 전편 저화질 버전（화질 저하는 정상），총 길이" + fmt_ts(duration) + "。"
         "화질/선명도 문제를 보고하지 마세요。"]
    if context_text:
        p.append("감독 대본：\n<감독대본>\n" + context_text + "\n</감독대본>")
    p.append("다음 세 가지만 수행（세부 문제는 이미 구간별 검토가 담당하므로 신경 쓰지 않아도 됨）：\n"
             "A. 서사 연속성: 처음부터 끝까지 보면서 어떤 시점들이 파워포인트식 하드컷(페이지 전체 급변, 전환 없음)?\n"
             "B. hero/주체 지속성：전편을 관통하는 주체 요소가 어떤 전환에서 단절、사라지거나 급변하는가？\n"
             "C. 전체 리듬：어떤 구간이 늘어짐（오랜 시간 새 정보 없음）、어떤 구간이 급한가？\n\n"
             + SEVERITY_RULE +
             "\n\n마크다운 출력, A/B/C 세 섹션, 발견된 항목은 [분:초] 타임스탬프 포함. 문제 없으면 '미발견'이라고 쓰세요. 꾸며내지 마세요.")
    return "\n\n".join(p)


def synthesis_prompt(duration, seg_reports, global_report):
    parts = ["당신은 검토 보고서 편집장입니다。아래는 동일한" + fmt_ts(duration) +
             "애니메이션 완성본의 구간별 검토 + 전편 검토 원시 기록，이들을 합쳐 최종 보고서 본문을 생성하세요。",
             "요구：\n"
             "1. 체크리스트 ①-⑧에 따라 항목별로 정리, 각 항목 아래에 시간순으로 발견 목록: - [분:초] 심각도 설명\n"
             "2. 동일 문제가 여러 구간에서 반복 보고되면 하나로 병합; 구간 리뷰와 전체 리뷰가 모순일 경우 둘 다 기재하고 '의심'으로 표시\n"
             "3. 각 발견의 시간점과 심각도 이모지(⚠️/⚡/💡)를 보존하고, 원본 기록에 없는 발견을 새로 추가하지 마세요\n"
             "4. 시작에 '문제 총수: ⚠️x ⚡y 💡z' 통계 행과 세 문장 이내의 총평을 제공\n"
             "5. 보고서 본문 마크다운만 출력하고 인사말 등은 제거",
             "<전편 검토>\n" + global_report + "\n</전편 검토>"]
    for (s, e, text) in seg_reports:
        parts.append(f"<구간검토 원본{fmt_ts(s)}–{fmt_ts(e)}>\n{text}\n</구간검토>")
    return "\n\n".join(parts)


def main():
    ap = argparse.ArgumentParser(description="AI 영상 검토：애니메이션 MP4 → checklist 구조화 검토 보고서")
    ap.add_argument("--video", required=True, help="완성본 경로（mp4）")
    ap.add_argument("--context", help="감독대본/씬 분할 설명 md 경로（선택，검토 컨텍스트로 사용）")
    ap.add_argument("--segment-len", type=int, default=60, help="분할 길이(초)（기본60）")
    ap.add_argument("--model", default=DEFAULT_MODEL, help=f"모델(기본값 {DEFAULT_MODEL})")
    ap.add_argument("--output", "-o", help="보고서 경로(기본: 비디오와 동일한 폴더<비디오명>-AI검토.md)")
    ap.add_argument("--yes", action="store_true",
                    help="압축된 비디오 세그먼트를 화산 방주 공식 인터페이스로 전송함(또는 DESIGN_CLOUD_OK=1 설정)")
    args = ap.parse_args()

    video = Path(args.video).resolve()
    if not video.exists():
        sys.exit(f"Error: 비디오가 존재하지 않습니다 {video}")

    if not args.yes and os.getenv("DESIGN_CLOUD_OK") != "1":
        sys.exit(
            f"[클라우드 기능 확인] 이번에 {video.name}을(를) 압축해 구간별로 ark.cn-beijing.volces.com으로 전송합니다"
            "(화산방주 공식 인터페이스，본인의 ARK_API_KEY로 비디오 이해 검토를 실행)。\n"
            "확인되면 다시 실행 시 --yes 추가，또는 환경변수 DESIGN_CLOUD_OK=1 설정。"
            "데이터 흐름 선언은 SECURITY.md 참조；로컬 무료 대안：scripts/verify-video.sh。")
    out_path = Path(args.output) if args.output else video.parent / f"{video.stem}-AI검토.md"

    context_text = ""
    if args.context:
        ctx = Path(args.context)
        if not ctx.exists():
            sys.exit(f"Error: 컨텍스트 파일이 존재하지 않습니다 {ctx}")
        context_text = ctx.read_text(encoding="utf-8")[:12000]

    api_key = load_api_key()
    session = requests.Session()
    session.trust_env = False  # ALL_PROXY 등 프록시 문제로부터 면역

    duration, has_audio = probe(video)
    log(f"비디오 {fmt_ts(duration)}，음성 트랙={'있음' if has_audio else '없음'}")

    onsets = detect_audio_onsets(video) if has_audio else []
    if has_audio:
        log(f"음향 onset 감지：{len(onsets)}개 → {['%.1f' % t for t in onsets]}")

    # 정지구간 객관적 검사（인접 구간 병합）
    raw_statics = detect_static_segments(video)
    statics = []
    for a, b in raw_statics:
        if statics and a - statics[-1][1] < 0.2:
            statics[-1] = (statics[-1][0], b)
        else:
            statics.append((a, b))
    log(f"정지구간 검사（≥3s）：{len(statics)}개 → "
        f"{[f'{a:.0f}-{b:.0f}s' for a, b in statics]}")

    total_usage = {"input_tokens": 0, "output_tokens": 0}

    def add_usage(u):
        for k in total_usage:
            total_usage[k] += u.get(k, 0) or 0

    seg_reports, failures = [], []
    with tempfile.TemporaryDirectory(prefix="ai-review-") as tmp:
        tmp = Path(tmp)
        # 분할
        bounds = []
        t0 = 0.0
        while t0 < duration - 1:
            bounds.append((t0, min(t0 + args.segment_len, duration)))
            t0 += args.segment_len
        log(f"분할：{len(bounds)}구간 × ≤{args.segment_len}s")

        for i, (s, e) in enumerate(bounds, 1):
            seg = tmp / f"seg{i}.mp4"
            compress(video, seg, ss=s, t=e - s)
            if seg.stat().st_size > MAX_SEGMENT_MB * 1024 * 1024:
                compress(video, seg, ss=s, t=e - s, width=960, fps=10, crf=32)
            mb = seg.stat().st_size / 1048576
            onsets_in = [t for t in onsets if s <= t < e]
            statics_in = [(a, b) for a, b in statics if a < e and b > s]
            log(f"구간{i} {fmt_ts(s)}–{fmt_ts(e)}（{mb:.1f}MB，onset×{len(onsets_in)}，"
                f"정지구간×{len(statics_in)}）검토 의뢰...")
            try:
                text, usage = ask_model(session, api_key, args.model,
                                        segment_prompt(s, e, duration, context_text,
                                                       onsets_in, statics_in),
                                        seg)
                add_usage(usage)
                seg_reports.append((s, e, text))
            except RuntimeError as err:
                log(f"  구간{i} 검토 의뢰 실패：{err}")
                failures.append((s, e, str(err)))

        # 전편 저화질 패스
        log("전편 저화질 버전 검토 의뢰（서사/hero/리듬）...")
        full = tmp / "full.mp4"
        compress(video, full, width=960, fps=10, crf=30)
        global_report, global_fail = "", None
        try:
            global_report, usage = ask_model(session, api_key, args.model,
                                             global_prompt(duration, context_text), full)
            add_usage(usage)
        except RuntimeError as err:
            global_fail = str(err)
            log(f"  전편 패스 실패：{err}")

    if not seg_reports and not global_report:
        sys.exit("Error: 모든 검토 호출이 실패하여 보고서를 생성할 수 없습니다。검토 결과를 꾸며내지 않습니다。\n" +
                 "\n".join(f"{fmt_ts(s)}–{fmt_ts(e)}: {m}" for s, e, m in failures))

    # 집계
    log("최종 보고서 집계...")
    try:
        body, usage = ask_model(session, api_key, args.model,
                                synthesis_prompt(duration, seg_reports,
                                                 global_report or "(전편 패스 호출 실패，기록 없음)"))
        add_usage(usage)
    except RuntimeError as err:
        log(f"집계 호출 실패（{err}），원본 기록을 이어붙인 형태로 대체")
        body = "> 집계 호출 실패，아래는 각 pass 원본 기록을 직접 이어붙인 것。\n\n" + \
               (global_report or "") + "\n\n" + \
               "\n\n".join(f"## 구간 {fmt_ts(s)}–{fmt_ts(e)}\n{t}" for s, e, t in seg_reports)

    lines = [f"# {video.name} · AI검토보고서",
             "",
             f"> 모델：{args.model} | 검토 시간：{time.strftime('%Y-%m-%d %H:%M')} | "
             f"재생시간: {fmt_ts(duration)} | 분할: {len(seg_reports)}성공/{len(failures)}실패 | "
             f"음향 onset：{len(onsets)}개 / 정지구간≥3s：{len(statics)}개"
             f"(모두 로컬 ffmpeg 객관적 검사; 모델은 소리를 듣지 않음, 음화 대조=onset+화면 확인) | "
             f"tokens：in {total_usage['input_tokens']} / out {total_usage['output_tokens']}",
             ""]
    if failures:
        lines.append("> ⚠️ 다음 시간대의 검토 의뢰가 실패하여 검토에 포함되지 않음：" +
                     "；".join(f"{fmt_ts(s)}–{fmt_ts(e)}（{m[:100]}）" for s, e, m in failures))
        lines.append("")
    if global_fail:
        lines.append(f"> ⚠️ 전편 연속성 패스 호출 실패：{global_fail[:200]}")
        lines.append("")
    lines.append(body)
    lines.append("\n\n---\n\n## 부록 · 객관적 검사 데이터（ffmpeg，모델 판단 아님）\n")
    lines.append("정지구간≥3s：" + (",".join(
        f"{fmt_ts(a)}–{fmt_ts(b)}（{b - a:.1f}s）" for a, b in statics) or "없음"))
    lines.append("\n음향 onset：" + (",".join(fmt_ts(t) for t in onsets) or "없음/오디오 없음"))
    lines.append("\n## 부록 · 각 구간 원본 검토 기록\n")
    if global_report:
        lines.append("### 전편 패스（서사/hero/리듬）\n\n" + global_report + "\n")
    for s, e, t in seg_reports:
        lines.append(f"### 구간 원본{fmt_ts(s)}–{fmt_ts(e)}\n\n{t}\n")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    log(f"보고서가 작성됨: {out_path}")
    print(out_path)


if __name__ == "__main__":
    main()
