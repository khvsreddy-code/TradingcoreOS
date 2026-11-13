FROM node:24-bookworm-slim

WORKDIR /app

# The gateway starts its TypeScript entrypoint with tsx. Keep dev dependencies
# in the image deliberately; installing with NODE_ENV=production would omit it.
COPY package*.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .

ENV NODE_ENV=production

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "const port = Number(process.env.REALTIME_GATEWAY_PORT || process.env.PORT || 8080); fetch('http://127.0.0.1:' + port + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["npm", "run", "realtime:gateway"]
