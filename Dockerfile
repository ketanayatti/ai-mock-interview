# ---------- Stage 1: Base ----------
FROM node:20-alpine AS base

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy package files (better layer caching)
COPY package*.json ./

# ---------- Stage 2: Dependencies ----------
FROM base AS dependencies

# Install only production dependencies
RUN npm ci --only=production

# ---------- Stage 3: Runtime ----------
FROM node:20-alpine AS runtime

# Install dumb-init again (each stage is isolated)
RUN apk add --no-cache dumb-init

# Create non-root user safely (no UID/GID conflicts)
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application source code
COPY . .

# Fix permissions
RUN chown -R nodejs:nodejs /app

# Use non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Correct ENTRYPOINT (no wrong path)
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "server.js"]