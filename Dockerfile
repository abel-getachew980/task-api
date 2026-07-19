FROM node:20-bullseye-slim

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate


COPY src ./src

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node src/index.js"]
