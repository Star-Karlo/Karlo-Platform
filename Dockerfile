# Two stages: the first has every devDependency and builds; the second carries
# only the build output and production deps, which is what keeps the image
# around 180 MB instead of 700.
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# adapter-node listens on PORT (default 3000). 4173 was Vite's PREVIEW port and
# was never what this image served on; a load balancer health check pointed at
# it would never pass.
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
EXPOSE 3000

# Not root. The process needs nothing root can do, and a container escape from
# root is a worse day than one from an unprivileged user.
USER node
CMD ["node", "build"]
