# Frontend: Vite build -> nginx (shu nginx /api va /uploads ni backendga yo'naltiradi, shuning uchun bitta port/manzil yetadi)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Bo'sh VITE_BASE_URL: brauzer so'rovlari o'sha manzilning o'zidagi /api ga ketadi (ngrok/domen bilan ishlaydi)
ENV VITE_BASE_URL=""
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
