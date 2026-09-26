# One image for the whole app: Node builds the frontend, then Django serves it
# alongside the API from the same origin.

FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
# Empty means same-origin: the app calls /api/... on whatever host served it.
ARG VITE_API_URL=
ARG VITE_MAP_TILE_URL=
ARG VITE_MAP_TILE_ATTRIBUTION=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_MAP_TILE_URL=$VITE_MAP_TILE_URL \
    VITE_MAP_TILE_ATTRIBUTION=$VITE_MAP_TILE_ATTRIBUTION
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/ .
COPY --from=frontend /frontend/dist ./frontend_dist
# collectstatic only compresses Django's own static files; pre-compress the frontend too so
# WhiteNoise can serve the .gz variants.
RUN SECRET_KEY=collectstatic-only python manage.py collectstatic --noinput \
    && python -m whitenoise.compress ./frontend_dist

RUN useradd --create-home app && mkdir -p /app/.cache && chown app /app/.cache
USER app

# Runtime settings sit below the installs so changing them doesn't invalidate those layers.
ENV PORT=8000 \
    WEB_CONCURRENCY=2 \
    FRONTEND_DIST=/app/frontend_dist

EXPOSE 8000
# Gunicorn takes its worker count from WEB_CONCURRENCY (about 60 MB each). A plan spends most
# of its time waiting on the routing provider, so threads let each worker serve several at once.
# Calls time out at 10 s each; leave room above gunicorn's 30 s default.
CMD ["sh", "-c", "gunicorn config.wsgi:application --bind 0.0.0.0:${PORT} --threads 4 --timeout 60 --access-logfile -"]
