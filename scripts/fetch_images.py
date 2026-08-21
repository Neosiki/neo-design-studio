#!/usr/bin/env python3
"""
Wikimedia Commons에서 실제 이미지를 가져옵니다(퍼블릭 도메인 / CC), design-studio의 '콘텐츠형 디자인용 진짜 이미지'에 사용(Phase 3.5).

왜 이 스크립트가 있는가: 콘텐츠형 디자인(앵무새/커피/말레이시아...)은 실제 이미지를 사용해야 하며 CSS 색 블록으로 대충 때울 수 없습니다.
매번 모델에게 즉석으로 이미지 수집 로직을 쓰게 하면 느리고 실수가 잦습니다(프록시 정리 잊음→TLS 오류 / 규정 준수 UA 누락→429). 여기서는 로직을 고정해 두어 다음에는 키워드만 바꾸면 됩니다.

사용법:
  python3 scripts/fetch_images.py --query "Petronas Towers" "Langkawi beach" "George Town street" \
      --out \u9879\u76ee/assets/img --count 2 --width 1600

각 query마다 앞의 count장씩 가져와 width로 리사이즈하고 out에 다운로드하며 목록(경로 | 라이선스 | 작성자 | 출처 페이지)을 출력하여 정직성 검증에 용이하게 합니다.
모두 가져오지 못하면 → 종료 코드 1, Phase 3.5 방식으로 이미지 확보 3단계 대체(Unsplash/Pexels → 원본 이미지 → 정직한 플레이스홀더)를 안내합니다.
"""
import argparse, json, os, re, sys, urllib.parse, urllib.request

# ① 프록시 정리: 로컬 curl/urllib가 프록시를 통해 가면 TLS 오류가 발생할 수 있음(참조 memory feedback_gemini_proxy)
for _k in ("ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy"):
    os.environ.pop(_k, None)

API = "https://commons.wikimedia.org/w/api.php"
# ② 규정에 맞는 User-Agent는 필수 요구사항, 그렇지 않으면 Wikimedia가 429를 반환함
UA = "design-studio-image-fetcher/1.0 (https://huasheng.ai; skill contact)"


def _api_get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def _safe(name):
    return re.sub(r"[^\w\-.]", "_", name)[:60]


def fetch(query, out, count, width):
    params = {
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": query, "gsrnamespace": 6, "gsrlimit": count,
        "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": width,
    }
    try:
        data = _api_get(params)
    except Exception as e:
        print(f"[FAIL search] {query}: {e}", file=sys.stderr)
        return []
    pages = (data.get("query", {}) or {}).get("pages", {})
    got = []
    for p in list(pages.values())[:count]:
        ii = (p.get("imageinfo") or [{}])[0]
        thumb = ii.get("thumburl") or ii.get("url")
        if not thumb:
            continue
        meta = ii.get("extmetadata", {}) or {}
        lic = (meta.get("LicenseShortName", {}) or {}).get("value", "?")
        artist = re.sub("<[^>]+>", "", (meta.get("Artist", {}) or {}).get("value", "?")).strip()
        ext = os.path.splitext(thumb)[1].split("?")[0] or ".jpg"
        fn = _safe(query) + "_" + _safe(p.get("title", "img").replace("File:", ""))
        fn = os.path.splitext(fn)[0][:55] + ext
        path = os.path.join(out, fn)
        try:
            req = urllib.request.Request(thumb, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
                f.write(r.read())
            got.append(path)
            print(f"[OK] {path}  | {lic} | {artist} | {ii.get('descriptionurl','')}")
        except Exception as e:
            print(f"[FAIL dl] {thumb}: {e}", file=sys.stderr)
    if not got:
        print(f"[EMPTY] '{query}'을(를) 가져오지 못했습니다 — 키워드를 바꾸거나 Phase 3.5로 대체하세요", file=sys.stderr)
    return got


def main():
    ap = argparse.ArgumentParser(description="Wikimedia Commons 실제 이미지 수집(design-studio Phase 3.5)")
    ap.add_argument("--query", nargs="+", required=True, help="하나 이상의 영어 키워드(영어로 찾을 확률이 높음)")
    ap.add_argument("--out", required=True, help="출력 디렉터리(권장 \u9879\u76ee/assets/img)")
    ap.add_argument("--count", type=int, default=2, help="각 키워드당 몇 장을 가져올지(기본값 2)")
    ap.add_argument("--width", type=int, default=1600, help="리사이즈 너비 px(기본값 1600)")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    allgot = []
    for q in a.query:
        allgot += fetch(q, a.out, a.count, a.width)
    print(f"\\n=== 총 {len(allgot)}장 {a.out}에 다운로드됨 ===")
    print("⚠️ 정직성 확인: 각 이미지 정보 제거 시 손실이 있는가? 라이선스가 사용을 허용하는가? 부적절한 것은 삭제하세요.")
    if not allgot:
        print("❌ 모두 실패 → Phase 3.5의 3단계 대체(Unsplash/Pexels → 원본 이미지 → 정직한 플레이스홀더, 흐름 지연 없음)", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
