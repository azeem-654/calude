# The media engine (engine/server.mjs) — FFmpeg with libass and the Noto
# fonts, so captions and thumbnails set Turkish and Urdu correctly; and
# Python with OpenCV and the YuNet face detector for engine/track.py (faces
# and the speaker, for framing that follows them and thumbnails that close in
# on a face); and yt-dlp, for a project started from the customer's own
# YouTube video. Built and pushed by `wrangler deploy -c media/wrangler.jsonc`.
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core ca-certificates python3 python3-venv curl \
 && rm -rf /var/lib/apt/lists/*
# OpenCV in its own environment (Debian's python3-opencv drags in a desktop).
RUN python3 -m venv /opt/cv \
 && /opt/cv/bin/pip install --no-cache-dir "opencv-python-headless==4.10.0.84" "numpy==2.2.6"
# yt-dlp, pinned, in its own environment; `[default]` brings yt-dlp-ejs, the
# scripts YouTube's player challenge needs, and Node (already here, it runs
# the engine) is the JavaScript runtime it is told to use (--js-runtimes node).
# YouTube changes often: when fetching starts failing for every video, bump
# this pin first.
RUN python3 -m venv /opt/yt \
 && /opt/yt/bin/pip install --no-cache-dir "yt-dlp[default]==2026.8.19"
WORKDIR /engine
# YuNet (opencv_zoo, Apache-2.0), pinned by its hash: a changed file is refused,
# and without it track.py falls back to OpenCV's own Haar cascade.
RUN curl -fsSL -o face_detection_yunet.onnx https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx \
 && echo "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4  face_detection_yunet.onnx" | sha256sum -c -
COPY engine/server.mjs ./server.mjs
COPY engine/track.py ./track.py
COPY engine/thumbLayout.mjs ./thumbLayout.mjs
ENV PORT=8080 MEDIA_ENGINE_OPEN=1 FONTS_DIR=/usr/share/fonts/truetype/noto WORK_DIR=/tmp/pc-media MAX_RUNNING=1 PYTHON=/opt/cv/bin/python YTDLP=/opt/yt/bin/yt-dlp
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
