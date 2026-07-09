FROM node:20-alpine

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./

# Install production dependencies only (bcryptjs is pure JS — Alpine works fine)
RUN npm ci --omit=dev

# Copy application source
COPY src/ ./src/

ENV NODE_ENV=production

# Cloud Run injects PORT=8080 automatically
EXPOSE 8080

CMD ["node", "src/server.js"]
