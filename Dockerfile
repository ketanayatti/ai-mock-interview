# Stage 1: Base with dependencies
FROM node:20-alpine AS base

# Install dumb-init to handle signals properly
RUN apk add --no-cache dumb-init

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Stage 2: Dependencies
FROM base AS dependencies
RUN npm ci --only=production

# Stage 3: Build (with dev dependencies for any build scripts if needed)
FROM base AS builder
RUN npm ci

# Stage 4: Runtime
FROM node:20-alpine AS runtime

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1000 nodejs && \
    adduser -D -u 1000 -G nodejs nodejs

WORKDIR /app

# Copy node_modules from dependencies stage
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application files
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000), (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose port
EXPOSE 3000

# Use dumb-init to run Node.js (handles signals correctly)
ENTRYPOINT ["/usr/local/bin/dumb-init", "--"]

# Start application
CMD ["node", "server.js"]
