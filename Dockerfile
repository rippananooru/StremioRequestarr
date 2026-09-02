FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npx tsc

ENV NODE_ENV=production

EXPOSE 7000

CMD ["node", "dist/index.js"]