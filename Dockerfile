# LeadGen API — Railway/Render deployment
# Builds from monorepo root (npm workspaces)

FROM node:20-slim

WORKDIR /app

# Install tsx globally for TypeScript execution
RUN npm install -g tsx@^4.19.0

# Copy root workspace files
COPY package.json package-lock.json turbo.json tsconfig.json ./

# Copy workspace package.json files first (layer caching)
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install all workspace dependencies
RUN npm ci

# Copy source code
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

# Build shared workspace package (required for imports)
RUN npm run build -w packages/shared

WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["npx", "tsx", "src/index.ts"]
