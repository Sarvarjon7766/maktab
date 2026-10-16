# Backend: Node 22 + (ixtiyoriy) NVIDIA CUDA runtime. GPU bo'lmasa ham ishlaydi (AI_PROVIDER=cpu).
# CUDA 13: onnxruntime-node 1.30 ning CUDA kutubxonasi libcublasLt.so.13 talab qiladi (CUDA 12.x image'da yuklanmay, jimgina CPUga o'tadi). Drayver CUDA 13.x ni qo'llashi kerak (595 seriya: 13.2).
# Qurish: docker compose build backend
ARG CUDA_IMAGE=nvidia/cuda:13.0.2-cudnn-runtime-ubuntu24.04
FROM ${CUDA_IMAGE}

ENV DEBIAN_FRONTEND=noninteractive NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg fontconfig ffmpeg && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p uploads private
EXPOSE 5050
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD curl -fs http://localhost:5050/api/health || exit 1
CMD ["node", "index.js"]
