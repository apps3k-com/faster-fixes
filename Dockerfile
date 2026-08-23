FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/widget-core/package.json packages/widget-core/package.json
COPY packages/widget-react/package.json packages/widget-react/package.json
COPY packages/mcp/package.json packages/mcp/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN export B2_REGION="eu-central-003" \
  B2_APP_KEY_ID="build-placeholder" \
  B2_APP_KEY="build-placeholder" \
  BASE_URL="https://ff.invalid" \
  DOMAIN_NAME="ff.invalid" \
  BETTER_AUTH_URL="https://ff.invalid" \
  BETTER_AUTH_SECRET="build-placeholder-not-for-runtime" \
  RESEND_API_KEY="re_build_placeholder" \
  GITHUB_APP_ID="1" \
  GITHUB_PRIVATE_KEY="build-placeholder" \
  STRIPE_WEBHOOK_SIGNING_SECRET="whsec_build_placeholder" \
  LINEAR_TOKEN_ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000" \
  SLACK_TOKEN_ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000" \
  JIRA_TOKEN_ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000" \
  && pnpm --filter @workspace/db db:gen \
  && pnpm --filter @fasterfixes/core build \
  && pnpm --filter @fasterfixes/react build \
  && pnpm --filter web build

FROM node:20-bookworm-slim AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

WORKDIR /app

RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl

COPY --from=builder /app /app
COPY docker-entrypoint.sh /usr/local/bin/faster-fixes-entrypoint

RUN chmod 755 /usr/local/bin/faster-fixes-entrypoint

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/usr/local/bin/faster-fixes-entrypoint"]
