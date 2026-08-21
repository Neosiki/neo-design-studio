#!/usr/bin/env python3
"""
verify.py — Playwright 래퍼, claude-design이 생성한 HTML을 검증하기 위한

Usage:
    python verify.py path/to/design.html                    # 기본: 열기+스크린샷+콘솔 오류 캡처
    python verify.py design.html --viewports 1920x1080,375x667  # 여러 뷰포트
    python verify.py deck.html --slides 10                  # 슬라이드 페이지별 캡처(앞 10장)
    python verify.py design.html --output ./screenshots/   # 출력 디렉터리
    python verify.py design.html --show                    # 비헤드리스, 실제 브라우저 창 열기

종속성:
    pip install playwright
    playwright install chromium
"""

import argparse
import sys
import os
import time
from pathlib import Path


def parse_viewport(s):
    w, h = s.split('x')
    return {'width': int(w), 'height': int(h)}


def verify_html(html_path, viewports=None, slides=0, output_dir=None, show=False, wait=2000):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: playwright이(가) 설치되어 있지 않습니다.")
        print("실행: pip install playwright && playwright install chromium")
        sys.exit(1)

    html_path = Path(html_path).resolve()
    if not html_path.exists():
        print(f"ERROR: 파일이 존재하지 않습니다: {html_path}")
        sys.exit(1)

    if output_dir is None:
        output_dir = html_path.parent / 'screenshots'
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    file_url = html_path.as_uri()
    stem = html_path.stem

    if viewports is None:
        viewports = [{'width': 1440, 'height': 900}]

    console_errors = []
    page_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not show)

        for viewport in viewports:
            context = browser.new_context(viewport=viewport, device_scale_factor=2)
            page = context.new_page()

            page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error", "warning") else None)
            page.on("pageerror", lambda err: page_errors.append(str(err)))

            print(f"\n→ 열기 {file_url} @ {viewport['width']}x{viewport['height']}")
            page.goto(file_url, wait_until='networkidle')
            page.wait_for_timeout(wait)

            if slides > 0:
                for i in range(slides):
                    screenshot_path = output_dir / f"{stem}-slide-{str(i + 1).zfill(2)}.png"
                    page.screenshot(path=str(screenshot_path), full_page=False)
                    print(f"  ✓ slide {i+1} → {screenshot_path.name}")

                    if i < slides - 1:
                        page.keyboard.press('ArrowRight')
                        page.wait_for_timeout(500)
            else:
                suffix = f"-{viewport['width']}x{viewport['height']}" if len(viewports) > 1 else ""
                screenshot_path = output_dir / f"{stem}{suffix}.png"
                page.screenshot(path=str(screenshot_path), full_page=False)
                print(f"  ✓ 스크린샷 → {screenshot_path.name}")

                full_path = output_dir / f"{stem}{suffix}-full.png"
                page.screenshot(path=str(full_path), full_page=True)
                print(f"  ✓ 전체 페이지 → {full_path.name}")

            if show:
                print("  (브라우저 창이 열려 있습니다. Enter를 눌러 닫기...)")
                input()

            context.close()

        browser.close()

    print("\n" + "=" * 50)
    print("검증 보고서")
    print("=" * 50)

    if page_errors:
        print(f"\n❌ Page Errors ({len(page_errors)}):")
        for e in page_errors:
            print(f"  - {e}")
    else:
        print("\n✅ JavaScript 오류 없음")

    if console_errors:
        print(f"\n⚠️  Console Errors/Warnings ({len(console_errors)}):")
        for e in console_errors[:20]:
            print(f"  - {e}")
        if len(console_errors) > 20:
            print(f"  ... {len(console_errors) - 20}개 더 있음")
    else:
        print("✅ 콘솔 깨끗함")

    print(f"\n📸 스크린샷 저장 위치: {output_dir}")

    return 0 if not page_errors else 1


def main():
    parser = argparse.ArgumentParser(
        description="Verify HTML design outputs with Playwright",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("html_path", help="HTML file path")
    parser.add_argument("--viewports", default="1440x900",
                        help="쉼표로 구분된 뷰포트 목록, 형식 WxH (기본 1440x900)")
    parser.add_argument("--slides", type=int, default=0,
                        help="슬라이드 모드: 처음 N장 캡처(HTML이 ArrowRight 키로 페이지 전환을 지원해야 함)")
    parser.add_argument("--output", default=None,
                        help="출력 디렉터리 (기본값: HTML이 있는 디렉터리의 screenshots/)")
    parser.add_argument("--show", action="store_true",
                        help="비헤드리스 모드, 실제 브라우저 창 열기")
    parser.add_argument("--wait", type=int, default=2000,
                        help="페이지를 연 후 대기할 밀리초(기본값 2000)")

    args = parser.parse_args()

    viewports = [parse_viewport(v) for v in args.viewports.split(",")]

    return verify_html(
        html_path=args.html_path,
        viewports=viewports,
        slides=args.slides,
        output_dir=args.output,
        show=args.show,
        wait=args.wait,
    )


if __name__ == "__main__":
    sys.exit(main())
