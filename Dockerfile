# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock* ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# postinstall (prisma generate) échoue ici faute de sources — on régénère après COPY
RUN yarn config set registry https://registry.npmjs.org \
	&& yarn config set network-timeout 600000 \
	&& yarn install --frozen-lockfile --ignore-scripts

COPY . .

RUN npx prisma generate \
	&& echo 'export * from "./client";' > src/generated/prisma/index.ts

# DATABASE_URL factice pour l'analyse build-time
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
RUN yarn build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Fichiers Prisma pour `migrate deploy` au démarrage
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/node_modules ./node_modules

# set -e : si la migration échoue, le conteneur crashe (restart-loop visible)
# au lieu de démarrer sur un schéma désynchronisé.
# exec : node devient PID 1 et reçoit SIGTERM → arrêt propre (moteur, SSE).
RUN printf '%s\n' \
    '#!/bin/sh' \
    'set -e' \
    'yarn prisma migrate deploy' \
    'exec node server.js' \
    > /app/start.sh && \
    chmod +x /app/start.sh

# Utilisateur non-root (même pattern que palato-scoring)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["/app/start.sh"]
