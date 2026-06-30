# Cloud Run container for LifeMap.
# Builds the static app and serves it with `vite preview`, which also runs the
# /api/ai proxy middleware (so live Claude works in the deployed app). The
# Anthropic key is NOT baked in — it is supplied at runtime as a Cloud Run env
# var and read by the proxy from process.env.

FROM node:20-alpine
WORKDIR /app

# Install deps (incl. devDeps — `vite` is needed at runtime to serve the preview).
COPY package*.json ./
RUN npm ci

COPY . .

# Client build-time flag (non-secret): route AI through the proxy to real Claude.
ENV VITE_USE_REAL_AI=true
RUN npm run build

# Cloud Run provides $PORT (defaults to 8080); the server must listen on it.
ENV PORT=8080
EXPOSE 8080
CMD npm run preview -- --host 0.0.0.0 --port ${PORT:-8080}
