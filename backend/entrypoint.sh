#!/usr/bin/env sh
set -e

echo "Waiting for Postgres at ${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}…"
python - <<'PY'
import os, time, socket
host = os.environ.get("POSTGRES_HOST", "postgres")
port = int(os.environ.get("POSTGRES_PORT", "5432"))
for _ in range(60):
    try:
        socket.create_connection((host, port), timeout=2).close()
        break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit("Postgres not reachable")
PY

python manage.py migrate --noinput

# Optional demo data (idempotent — skips if users already exist).
if [ "${SEED_DEMO:-0}" = "1" ]; then
    python manage.py seed || true
fi

exec gunicorn squaredup.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-3}" \
    --access-logfile - --error-logfile -
