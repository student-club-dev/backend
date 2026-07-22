# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app
# Prisma's engines are dynamically linked against OpenSSL, but node:20-alpine ships without the
# `openssl` package. Without it Prisma cannot detect the version, falls back to the
# openssl-1.1.x engine and then fails to load libssl.so.1.1 (Alpine 3.17+ has OpenSSL 3.x).
# Must come before `npm ci` so engine download and platform detection see the real version.
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Same reason as the build stage: the query engine @prisma/client loads at runtime needs libssl.
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/main.js"]
