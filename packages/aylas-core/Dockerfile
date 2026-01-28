# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the project (produces dist/server.js and dist/index.js)
RUN npm run build

# Remove devDependencies to prepare for production install (optional strategy, or just use new stage)

# Stage 2: Production
FROM node:20-slim AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/server.js"]
