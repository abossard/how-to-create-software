FROM node:22 AS base
WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies first to leverage caching
COPY package.json package-lock.json* .npmrc* ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM node:22 AS build
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json* .npmrc* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5173
COPY --from=build /app/dist ./dist
COPY package.json package-lock.json* ./
# Install production deps (ensures versions align with build image)
RUN npm ci --omit=dev || npm install --omit=dev
COPY server.mjs ./

EXPOSE 5173
CMD ["node", "server.mjs"]
