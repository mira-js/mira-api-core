FROM node:22-bookworm-slim AS base
RUN npm install -g pnpm@9.15.0
WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared-core/package.json packages/shared-core/package.json
COPY packages/core-collectors/package.json packages/core-collectors/package.json
COPY packages/api-core/package.json packages/api-core/package.json

RUN pnpm install --frozen-lockfile

# Build shared-core and core-collectors first
COPY packages/shared-core/ packages/shared-core/
RUN pnpm --filter @mira/shared-core build

COPY packages/core-collectors/ packages/core-collectors/
RUN pnpm --filter @mira/core-collectors build

# Build api-core
COPY packages/api-core/ packages/api-core/
COPY prompts/ prompts/
RUN pnpm --filter @mira/api-core build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "packages/api-core/dist/index.js"]
