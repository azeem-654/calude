# The media engine (engine/server.mjs) — FFmpeg with libass and the Noto
# fonts, so captions and thumbnails set Turkish and Urdu correctly.
# Built and pushed by `wrangler deploy -c media/wrangler.jsonc`.
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /engine
COPY engine/server.mjs ./server.mjs
ENV PORT=8080 MEDIA_ENGINE_OPEN=1 FONTS_DIR=/usr/share/fonts/truetype/noto WORK_DIR=/tmp/pc-media MAX_RUNNING=1
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
