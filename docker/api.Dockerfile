# Colyseus game server.
#
# Node 24, and the pnpm workspace layout is kept in the runtime image rather
# than only `apps/server/dist`. Both follow from one fact:
# `@spaceship-defender/protocol` exports `./src/index.ts`, and tsup keeps it
# external, so the built bundle imports the package instead of inlining it. pnpm
# resolves that import by realpath into `packages/protocol/`, outside
# `node_modules`, where Node's native type stripping applies -- which is on by
# default from Node 22.18 onward and is what `pnpm start` already relies on in
# development.
FROM node:24-alpine AS base
WORKDIR /app
ENV CI=true
RUN corepack enable

# Manifests only, so a source edit does not re-resolve the dependency graph. The
# whole workspace is listed because pnpm reads every manifest even for a
# filtered install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/display/package.json apps/display/
COPY apps/controller/package.json apps/controller/
COPY apps/admin/package.json apps/admin/
COPY packages/protocol/package.json packages/protocol/
COPY packages/game-core/package.json packages/game-core/
COPY packages/client-shared/package.json packages/client-shared/
COPY packages/config/package.json packages/config/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter @spaceship-defender/server...
COPY tsconfig.base.json tsconfig.json ./
COPY packages/config packages/config
COPY packages/protocol packages/protocol
COPY packages/game-core packages/game-core
COPY apps/server apps/server
RUN pnpm --filter @spaceship-defender/server build

# A second install rather than a prune of the first. `pnpm prune` reaches the
# root project's devDependencies, not a filtered workspace's, and a prune in the
# build stage would not shrink the image anyway: a runtime stage built `FROM
# build` inherits every layer, so a deletion on top only adds one more.
FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @spaceship-defender/server...

FROM node:24-alpine AS runtime
WORKDIR /app
# The dependency tree first -- symlink farm, workspace links and all -- then the
# sources those links point at.
COPY --from=prod-deps /app /app
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/packages/protocol/src packages/protocol/src
COPY --from=build /app/packages/game-core/src packages/game-core/src
ENV NODE_ENV=production HOST=0.0.0.0 PORT=2567
EXPOSE 2567
# `pnpm start` would add `--env-file-if-exists=../../.env.local`; configuration
# comes from the container environment instead.
CMD ["node", "apps/server/dist/index.js"]
