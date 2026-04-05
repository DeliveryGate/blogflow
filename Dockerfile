FROM node:18-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY web/package*.json ./web/
RUN cd web && npm install --production
COPY prisma ./prisma
RUN cd web && npx prisma generate --schema=../prisma/schema.prisma
COPY . .
EXPOSE 3000
CMD cd web && npx prisma db push --schema=../prisma/schema.prisma --skip-generate && node index.js
