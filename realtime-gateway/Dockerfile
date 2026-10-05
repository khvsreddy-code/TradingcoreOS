FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .

EXPOSE 8080
CMD ["npm", "run", "realtime:gateway"]
