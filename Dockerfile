FROM node:18-alpine

WORKDIR /app

# Install pnpm and curl for health check
RUN npm install -g pnpm && apk add --no-cache curl

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies (including dev for build and runtime schema generation)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application (needs dev dependencies for tsc-alias)
RUN pnpm build

# Generate schema during build (when dev dependencies are available)
RUN pnpm run db:generate

# Remove dev dependencies after build and schema generation
RUN pnpm prune --prod

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Seed data and start (use compiled JS since ts-node was removed)
CMD ["sh", "-c", "node dist/database/seed.js && pnpm start"]
