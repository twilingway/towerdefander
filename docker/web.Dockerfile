# One Dockerfile for all three browser apps: display, controller, admin.
#
# They differ only in which workspace is built and which public addresses are
# baked in, and Vite bakes `VITE_*` at build time. Vite reads them from the
# process environment as well as from `.env` files -- the same route
# `scripts/run-e2e.mjs` already uses -- so build arguments are enough, and
# `.dockerignore` drops any `.env*` that would otherwise win over them.
FROM node:24-alpine AS deps
ARG APP_NAME
WORKDIR /app
ENV CI=true
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/display/package.json apps/display/
COPY apps/controller/package.json apps/controller/
COPY apps/admin/package.json apps/admin/
COPY packages/protocol/package.json packages/protocol/
COPY packages/game-core/package.json packages/game-core/
COPY packages/client-shared/package.json packages/client-shared/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile --filter "@spaceship-defender/${APP_NAME}..."

FROM deps AS build
ARG APP_NAME
# Empty by default: the admin console needs neither, and an unset argument must
# not turn into the literal string "undefined" in a bundle.
ARG VITE_GAME_SERVER_URL=""
ARG VITE_CONTROLLER_URL=""
ENV VITE_GAME_SERVER_URL=${VITE_GAME_SERVER_URL}
ENV VITE_CONTROLLER_URL=${VITE_CONTROLLER_URL}
COPY tsconfig.base.json tsconfig.json ./
COPY packages packages
COPY apps/${APP_NAME} apps/${APP_NAME}
RUN pnpm --filter "@spaceship-defender/${APP_NAME}" build

FROM nginx:alpine AS runtime
ARG APP_NAME
# Which nginx configuration to use is the one other thing that differs: the
# console proxies /admin to the API, the game clients serve static files only.
ARG NGINX_CONF=docker/nginx-static.conf
COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/${APP_NAME}/dist /usr/share/nginx/html
EXPOSE 80
