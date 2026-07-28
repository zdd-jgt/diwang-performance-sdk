FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
COPY services/cleaner/package.json services/cleaner/tsconfig.json services/cleaner/tsup.config.ts ./services/cleaner/
RUN pnpm install --frozen-lockfile

COPY packages/contracts ./packages/contracts
COPY services/cleaner ./services/cleaner
RUN pnpm --filter @diwang/contracts build
RUN pnpm --filter @diwang/cleaner build

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/services/cleaner/dist/main.mjs ./main.mjs

USER node
STOPSIGNAL SIGTERM
CMD ["node", "main.mjs"]
