FROM node:22-alpine AS base
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/email-templates/package.json ./packages/email-templates/
RUN npm ci

# --- Web ---
FROM deps AS web
COPY . .
# WHY: anonymous volumeがnode_modulesを上書きするため、entrypointでprisma generateを実行
ENTRYPOINT ["./docker-entrypoint.sh"]
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=@chibatech/web"]

# --- Worker ---
FROM deps AS worker
COPY . .
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "dev", "--workspace=@chibatech/worker"]
