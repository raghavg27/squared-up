# Squared Up frontend — build with Vite, serve static via nginx (with /api proxy).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite inlines VITE_* at build time, so the OAuth client ID must be present now.
# Empty by default → Google button falls back to phone sign-in.
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

FROM nginx:alpine
# nginx:alpine auto-runs envsubst on /etc/nginx/templates/*.template at boot,
# substituting only these defined env vars (leaves $host etc. intact).
# Defaults keep `docker compose up` working; Railway overrides both.
ENV PORT=80 BACKEND_URL=http://backend:8000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
CMD ["nginx", "-g", "daemon off;"]
