# Humsafar — one image, because the product is one process tree.
#
# The Node backend spawns `python3 -m humsafar` for every run (see
# runService.js), so Node and Python have to live in the same container. Node is
# the base and Python is added, rather than the other way round, because the
# Node image ships a working npm and the Python one does not.
#
# The frontend is built here and served by the backend, which is what makes it
# same-origin with the API — the precondition for cookie auth. See session.js.

FROM node:22-slim

# `--no-install-recommends` keeps this from dragging in a compiler toolchain we
# do not need; the Python dependencies are pure-Python wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies before source, so a code change does not re-run either install.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY frontend/package.json frontend/package-lock.json* ./frontend/
# The frontend build needs its dev dependencies (vite), so this one is not
# --omit=dev. It stays in the image; splitting it into a builder stage would
# save perhaps 150MB and cost more than it is worth tonight.
RUN npm --prefix frontend ci || npm --prefix frontend install

COPY agents/requirements.txt ./agents/
# Debian 12 marks the system Python as externally managed. There is exactly one
# Python application in this image, so a venv would add indirection with no
# isolation benefit.
RUN pip3 install --no-cache-dir --break-system-packages -r agents/requirements.txt

COPY . .

RUN npm --prefix frontend run build

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    HUMSAFAR_PYTHON=python3

EXPOSE 3000

# Required at runtime, no default: server.js refuses to bind a non-loopback host
# without INTERNAL_API_TOKEN, and a default here would be a published secret.
# Set INTERNAL_API_TOKEN, SESSION_SECRET, OPENAI_API_KEY, PRAVA_SECRET_KEY and
# PRAVA_PUBLISHABLE_KEY in the host's environment.

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--network-family-autoselection-attempt-timeout=2000", "backend/src/server.js"]
