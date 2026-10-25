FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 8081
CMD ["npx", "expo", "start", "--host", "lan", "--port", "8081", "--max-workers", "1", "--clear"]
