# Design Studio — 로컬 서버 이미지
#
# 핵심 작업(status·inspect·plan·generate·revise·verify)은 의존성 없이 돌기 때문에
# 기본 이미지는 Node 하나만 있으면 된다. pptx·pdf·mp4 내보내기가 필요하면
# --build-arg WITH_EXPORT=1 로 Playwright와 내보내기 패키지를 넣는다.
#
#   docker build -t design-studio .
#   docker run --rm -p 7801:7801 -v "$PWD/my-project:/project" design-studio
#   curl localhost:7801/ops
#
#   # 내보내기까지 (이미지가 크게 늘어난다)
#   docker build --build-arg WITH_EXPORT=1 -t design-studio:export .
#
# MCP로 쓰려면 서버 대신 stdio 진입점을 띄운다:
#   docker run --rm -i -v "$PWD/my-project:/project" design-studio node scripts/design/mcp.mjs

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base

WORKDIR /app

# 렌더·검수에 필요한 파일만 넣는다. demos/assets의 큰 미디어는 이미지에 들어가지 않는다.
COPY package.json ./
COPY schemas ./schemas
COPY scripts ./scripts
COPY skills ./skills
COPY docs ./docs
COPY SKILL.md ./

ARG WITH_EXPORT=0
RUN if [ "$WITH_EXPORT" = "1" ]; then \
      npm install --omit=dev --no-audit --no-fund pptxgenjs playwright pdf-lib sharp && \
      npx playwright install --with-deps chromium; \
    else \
      echo "내보내기 없이 빌드합니다 (WITH_EXPORT=1로 pptx/pdf/mp4 지원 추가)"; \
    fi

# 프로젝트는 볼륨으로 마운트한다. 이미지 안에 사용자 자료를 넣지 않는다.
VOLUME ["/project"]
# 컨테이너 안에서 0.0.0.0 바인딩은 정상이다 — 실제 노출 경계는 `docker run -p`다.
# 그래서 명시적으로 면제하되, 호스트 밖으로 게시할 때는 DESIGN_TOKEN을 함께 주는 것을 권한다.
ENV DESIGN_PROJECT=/project \
    DESIGN_HOST=0.0.0.0 \
    DESIGN_PORT=7801 \
    DESIGN_ALLOW_INSECURE_HOST=1

EXPOSE 7801

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.DESIGN_PORT||7801)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "node scripts/design/serve.mjs --host \"$DESIGN_HOST\" --port \"$DESIGN_PORT\" ${DESIGN_TOKEN:+--token \"$DESIGN_TOKEN\"}"]


# 파일 역할: 컨테이너 실행 환경 정의

