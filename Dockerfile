FROM node:18-alpine

WORKDIR /app

# Install pnpm and curl for health check
RUN npm install -g pnpm && apk add --no-cache curl

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies (including dev for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application (needs dev dependencies for tsc-alias)
RUN pnpm build

# Remove dev dependencies after build
RUN pnpm prune --prod

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Generate schema and seed data (database already created by docker-compose)
CMD ["sh", "-c", "pnpm run db:generate && pnpm run db:seed && pnpm start"]
