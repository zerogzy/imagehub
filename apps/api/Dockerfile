# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN npm ci --workspace=packages/shared --workspace=apps/api

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# Build shared package first
RUN npm run build -w packages/shared

# Build API
RUN npm run build -w apps/api

# ---- Production Stage ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/shared/package.json ./packages/shared/

# Keep Prisma CLI and ts-node available so release containers can run db init/seed commands.
RUN npm ci --workspace=packages/shared --workspace=apps/api

# Copy built files
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/scripts ./apps/api/scripts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Create storage directory
RUN mkdir -p /app/storage/original /app/storage/preview /app/storage/video /app/storage/audio /app/storage/exports /app/storage/temp

EXPOSE 3001

CMD ["node", "apps/api/dist/src/main.js"]
