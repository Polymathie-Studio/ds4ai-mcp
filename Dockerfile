# Reliable build for the DS4AI MCP HTTP server.
# Standard Node image; npm install + tsc build, then run the HTTP entry.
FROM node:22-slim
WORKDIR /app

# Install all dependencies (including devDependencies: tsc is needed to build).
COPY package.json package-lock.json ./
RUN npm ci

# Build to dist/, then the resources the server serves at runtime are already
# in the copied tree.
COPY . .
RUN npm run build

# Railway provides PORT; the server reads it and serves /health and /mcp.
EXPOSE 3000
CMD ["node", "dist/http.js"]
