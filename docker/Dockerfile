# Stages:
#   - frontend-build: Build frontend
#   - backend-build: Build backend environment
#   - backend-dev-build: Similar to `backend-build`, but also compiles and installs development dependencies
#   - rahasher-build: Build RAHasher
#   - sigil-build: Build sigil Python bindings (title ID extraction)
#   - emulator-stage: Fetch and extract emulators
#   - nginx-build: Build nginx modules
#   - production-stage: Setup frontend and backend
#   - slim-image: Slim image with only the necessary files
#   - full-image: Full image with emulator stage
#   - dev-slim: Slim image with development dependencies
#   - dev-full: Full image with emulator stage and development dependencies


# ARGUMENT DECLARATIONS
ARG ALPINE_VERSION=3.23
ARG ALPINE_SHA256=25109184c71bdad752c8312a8623239686a9a2071e8825f20acb8f2198c3f659
# Pins the base image tag, so it cannot read ../.python-version; keep the two in sync.
ARG PYTHON_VERSION=3.14
ARG PYTHON_ALPINE_SHA256=8caa2adfeb414dfe68d8b257f7aea9e205a400521c2b13b2d2e5e731fb8e70e5
ARG NODE_VERSION=24.16
ARG NODE_ALPINE_SHA256=2bdb65ed1dab192432bc31c95f94155ca5ad7fc1392fb7eb7526ab682fa5bf14
ARG NGINX_VERSION=1.29.8
ARG NGINX_SHA256=5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de
ARG UV_VERSION=0.12.13
ARG UV_SHA256=eb47c391d3a252d9d912270dd2b5e234af5493e92039fedb483f1dd1cb5659ce


FROM python:${PYTHON_VERSION}-alpine${ALPINE_VERSION}@sha256:${PYTHON_ALPINE_SHA256} AS python-alias


# FRONTEND BUILD
# Built on the native build platform: the output (/front/dist) is static JS/CSS,
# fully architecture-independent, so there is no need to emulate the target arch.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine${ALPINE_VERSION}@sha256:${NODE_ALPINE_SHA256} AS frontend-build
WORKDIR /front

COPY ./frontend/package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY ./frontend ./
RUN npm run build


# BACKEND NODE HELPERS BUILD (server-side ROM patching via RomPatcher.js)
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION}@sha256:${NODE_ALPINE_SHA256} AS backend-node-build
WORKDIR /backend-node/rom_patcher
COPY ./backend/utils/rom_patcher/package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund


# https://github.com/astral-sh/uv/pkgs/container/uv/452595714
FROM ghcr.io/astral-sh/uv:${UV_VERSION}-python${PYTHON_VERSION}-alpine@sha256:${UV_SHA256} AS uv-stage


# BACKEND PYTHON BUILD
FROM python-alias AS backend-build

# libpq-dev is needed to build psycopg-c
# mariadb-connector-c-dev is needed to build mariadb-connector
RUN apk add --no-cache \
    gcc \
    libpq-dev \
    mariadb-connector-c-dev \
    musl-dev

COPY --from=uv-stage /usr/local/bin/uv /usr/local/bin/uvx /bin/

WORKDIR /src

COPY ./pyproject.toml ./uv.lock /src/
RUN uv sync --frozen --no-cache

FROM backend-build AS backend-dev-build

# linux-headers is needed to install psutil
RUN apk add --no-cache \
    linux-headers

RUN uv sync --frozen --no-cache --all-extras


# CUSTOM RAHASHER FOR RETROACHIEVEMENTS
FROM alpine:${ALPINE_VERSION}@sha256:${ALPINE_SHA256} AS rahasher-build
RUN apk add --no-cache \
    g++ \
    git \
    linux-headers \
    make \
    zlib-dev \
    bash

ARG RALIBRETRO_VERSION=1.8.3

RUN git clone --recursive --branch "${RALIBRETRO_VERSION}" --depth 1 https://github.com/RetroAchievements/RALibretro.git && \
    cd ./RALibretro && \
    sed -i '22a #include <ctime>' ./src/Util.h && \
    sed -i '6a #include <unistd.h>' \
        ./src/libchdr/deps/zlib-1.3.1/gzlib.c \
        ./src/libchdr/deps/zlib-1.3.1/gzread.c \
        ./src/libchdr/deps/zlib-1.3.1/gzwrite.c && \
    make HAVE_CHD=1 -f ./Makefile.RAHasher


# SIGIL TITLE ID EXTRACTION LIBRARY
# Built from python-alias (not plain alpine) so the cffi extension matches the
# CPython ABI of the venv produced in backend-build.
FROM python-alias AS sigil-build
RUN apk add --no-cache \
    cmake \
    g++ \
    git \
    make \
    musl-dev

# Keep this pin in sync with the dev image's SIGIL_VERSION in ../Dockerfile.
ARG SIGIL_VERSION=4b0f138fef12caf0b2ceb85e034cd5a3ba18a653

RUN git clone --filter=blob:none https://github.com/rommforge/argosy-sigil.git && \
    cd ./argosy-sigil && \
    git checkout "${SIGIL_VERSION}" && \
    git submodule update --init --recursive && \
    cmake -B ./build-python -S . -DSIGIL_BUILD_CLI=OFF -DSIGIL_BUILD_TESTS=OFF && \
    cmake --build ./build-python --target sigil && \
    pip install --no-cache-dir cffi setuptools && \
    cd ./bindings/python && \
    python build_sigil.py && \
    mkdir /sigil-pkg && \
    cp ./sigil/*.py ./sigil/_sigil.*.so /sigil-pkg/


# FETCH EMULATORJS, RUFFLE, JS-DOS AND FAKE-08
# Keep the pins below in sync with the dev image's copies in ../Dockerfile.
FROM alpine:${ALPINE_VERSION}@sha256:${ALPINE_SHA256} AS emulator-stage

RUN apk add --no-cache \
    7zip \
    wget \
    ca-certificates

# EmulatorJS, built from source instead of fetched as a release.
#
# THIS REPLACES A CHECKSUM-VERIFIED RELEASE DOWNLOAD. The previous form
# wget'd EmulatorJS 4.2.3 and checked it against a pinned SHA256. This COPY
# trusts a tree assembled outside the build instead, so the verification has
# moved out of the Dockerfile rather than disappeared: rebuild it from the
# pinned commit below and diff if you need to confirm what is in it. This is
# a dev-image decision; upstream rommapp/romm should keep the release fetch.
#
# Why: 4.2.3 is from 2025-07-05. Tracking it meant carrying backports for
# things fixed upstream long ago. The duplicate-mkdir patch that used to live
# here was one (EmulatorJS 9a12941, ErrnoError 20 thrown once per standalone
# zip directory record -- 455 times across 34 ROMs in our library); core
# options v2 would have been a second, which is what makes core options show
# their labels rather than raw values. Both are in main, so both patches are
# gone from this file.
#
# The tree is staged by scummvm-wasm and not committed -- ~286 MB, nearly all
# of it core .data files. Assembled from a pinned EmulatorJS checkout:
#
#     npm ci && npm run minify          -> data/
#     @emulatorjs/core-* npm packages   -> data/cores/*.data, reports/*.json
#
# which reproduces the release layout: 187 cores and 48 reports, against the
# release's 187 and 48, plus the two ScummVM files staged below.
#
# Pinned to a commit rather than a branch: main is unreleased and moves. Go
# back to the release fetch once a release newer than 4.2.3 exists.
ARG EMULATORJS_COMMIT=0b1c5e9

COPY docker/emulatorjs/ /emulatorjs/

# ScummVM core (built separately by the scummvm-wasm project, staged here
# by that project's build/deploy-to-romm.sh -- not part of the official
# EmulatorJS release above). See docker/scummvm-core/README.md.
#
# Both files are staged: EmulatorJS's own downloadGameCore() (src/emulator.js)
# defaults EVERY core to the "-legacy" filename on a user's first visit
# whenever the core's reports/<core>.json doesn't set `options.defaultWebGL2`
# -- this is unconditional on first visit, not a real check of the browser's
# actual WebGL2 support (confirmed: dosbox_pure's own shipped report doesn't
# set it either). So both names must resolve or a first-time visitor routed
# to "-legacy" 404s and the game never boots.
COPY docker/scummvm-core/scummvm-thread-wasm.data /emulatorjs/data/cores/scummvm-thread-wasm.data
COPY docker/scummvm-core/scummvm-thread-legacy-wasm.data /emulatorjs/data/cores/scummvm-thread-legacy-wasm.data
# Core report JSON, generated by scummvm-wasm's build/package-core.sh.
# EmulatorJS reads buildStart from it to key its core cache (without the
# file it logs "Could not fetch core report JSON! Core caching will be
# disabled!" and re-downloads the core every launch) and defaultWebGL2 to
# pick the regular filename on first visit.
COPY docker/scummvm-core/scummvm.json /emulatorjs/data/cores/reports/scummvm.json
# ScummVM's engine-data (fonts.dat, kyra.dat, ultima.dat and 39 others) is no
# longer embedded in the wasm -- the core fetches each file from this directory
# on first read, which is what took the core from 90 MB to 23.5 MB. Without
# this the core loads and then 404s on every engine that needs one.
COPY docker/scummvm-core/scummvm-engine-data /emulatorjs/data/cores/scummvm-engine-data

ARG RUFFLE_VERSION=nightly-2025-08-14
ARG RUFFLE_FILE=ruffle-nightly-2025_08_14-web-selfhosted.zip
ARG RUFFLE_SHA256=178870c5e7dd825a8df35920dfc5328d83e53f3c4d5d95f70b1ea9cd13494151

RUN wget "https://github.com/ruffle-rs/ruffle/releases/download/${RUFFLE_VERSION}/${RUFFLE_FILE}" && \
    echo "${RUFFLE_SHA256}  ${RUFFLE_FILE}" | sha256sum -c - && \
    unzip -o "${RUFFLE_FILE}" -d /ruffle && \
    rm -f "${RUFFLE_FILE}"

ARG JSDOS_VERSION=8.4.1
ARG JSDOS_SHA256=26118692bbb180aec78ec1697eb1ea6b28ff410101870cfa3e68309914c7eaa6

# The bundled index.html is a js-dos demo page that would be served unauthenticated;
# source maps, Emscripten symbol files and type declarations are unused at runtime.
RUN wget "https://github.com/caiiiycuk/js-dos/releases/download/v${JSDOS_VERSION}/release.zip" -O jsdos.zip && \
    echo "${JSDOS_SHA256}  jsdos.zip" | sha256sum -c - && \
    unzip -o jsdos.zip -d /jsdos && \
    rm -f jsdos.zip && \
    rm -rf /jsdos/dist/index.html /jsdos/dist/emulators/types && \
    find /jsdos/dist \( -name '*.map' -o -name '*.symbols' \) -exec rm -f {} +

ARG FAKE08_P3A_COMMIT=6519efd9dd1ca853e5c66f7ae9146ace0b7073dc
ARG FAKE08_JS_SHA256=fd2cd4677956037e41a91dbd40fc1a9c4f5979355d55ce3f9312400e11da463e
ARG FAKE08_WASM_SHA256=4339a77e0aa5aa6f4a5bce9fd8286053eedf7f23f2d853db7f4900f6fff4c93a
ARG FAKE08_P3A_RAW=https://raw.githubusercontent.com/fabkury/p3a/${FAKE08_P3A_COMMIT}/webui/pico8

# FAKE-08 (MIT) publishes no web build, so these come from p3a (Apache-2.0),
# which compiled them. Pinned by commit and checksum: that tree has no tags.
RUN mkdir -p /fake08 && \
    wget "${FAKE08_P3A_RAW}/fake08.js" -O /fake08/fake08.js && \
    wget "${FAKE08_P3A_RAW}/fake08.wasm" -O /fake08/fake08.wasm && \
    echo "${FAKE08_JS_SHA256}  /fake08/fake08.js" | sha256sum -c - && \
    echo "${FAKE08_WASM_SHA256}  /fake08/fake08.wasm" | sha256sum -c -


# BUILD NGINX MODULE WITH MOD_ZIP
FROM alpine:${ALPINE_VERSION}@sha256:${ALPINE_SHA256} AS nginx-build

RUN apk add --no-cache \
    gcc \
    git \
    libc-dev \
    make \
    pcre-dev \
    zlib-dev

ARG NGINX_VERSION
# The specified commit SHA is the latest commit on the `master` branch at the time of writing.
# It includes a fix to correctly calculate CRC-32 checksums when using upstream subrequests.
# TODO: Move to a tagged release of `mod_zip`, once a version newer than 1.3.0 is released.
ARG NGINX_MOD_ZIP_COMMIT=a9f9afa441117831cc712a832c98408b3f0416f6

# Clone both `nginx` and `ngx_http_zip_module` repositories, needed to compile the module from source.
# This is needed to be able to dinamically load it as a module in the final image. `nginx` Docker
# images do not have a simple way to include third-party modules.
RUN git clone https://github.com/evanmiller/mod_zip.git && \
    cd ./mod_zip && \
    git checkout "${NGINX_MOD_ZIP_COMMIT}" && \
    cd ../ && \
    git clone --branch "release-${NGINX_VERSION}" --depth 1 https://github.com/nginx/nginx.git && \
    cd ./nginx && \
    ./auto/configure --with-compat --add-dynamic-module=../mod_zip/ && \
    make -f ./objs/Makefile modules && \
    chmod 644 ./objs/ngx_http_zip_module.so


# PRODUCTION STAGE
FROM nginx:${NGINX_VERSION}-alpine${ALPINE_VERSION}@sha256:${NGINX_SHA256} AS production-stage
ARG WEBSERVER_FOLDER=/var/www/html

RUN apk add --no-cache \
    bash \
    libarchive-tools \
    libmagic \
    mariadb-connector-c \
    libpq \
    nodejs \
    7zip \
    tzdata \
    valkey \
    valkey-cli

# Add Python by copying it from the official Docker image. This way, we don't rely on Alpine's
# Python version, which could not be the same as the one used in the backend build stage.
# TODO: Replace with a bundled installation of Python using `uv`, when it is supported.
#       Related issue: https://github.com/astral-sh/uv/issues/7865
ARG PYTHON_VERSION
COPY --from=python-alias /usr/lib/* /usr/lib/
COPY --from=python-alias /usr/local/bin/* /usr/local/bin/
COPY --from=python-alias /usr/local/include/python${PYTHON_VERSION} /usr/local/include/python${PYTHON_VERSION}
COPY --from=python-alias /usr/local/lib/libpython* /usr/local/lib/
COPY --from=python-alias /usr/local/lib/python${PYTHON_VERSION} /usr/local/lib/python${PYTHON_VERSION}

COPY --from=rahasher-build /RALibretro/bin64/RAHasher /usr/bin/RAHasher
COPY --from=nginx-build ./nginx/objs/ngx_http_zip_module.so /usr/lib/nginx/modules/
COPY --from=frontend-build /front/dist ${WEBSERVER_FOLDER}
COPY --from=backend-node-build /backend-node/rom_patcher/node_modules/rom-patcher/rom-patcher-js /backend/utils/rom_patcher/rom-patcher-js

COPY ./frontend/assets ${WEBSERVER_FOLDER}/assets
RUN mkdir -p ${WEBSERVER_FOLDER}/assets/romm && \
    ln -sf /romm/resources ${WEBSERVER_FOLDER}/assets/romm/resources
COPY ./backend /backend

# Setup init script and config files
COPY ./docker/init_scripts/* /
COPY ./docker/nginx/js/ /etc/nginx/js/
COPY ./docker/nginx/templates/ /etc/nginx/templates/
COPY ./docker/nginx/default.conf /etc/nginx/nginx.conf
COPY ./docker/gunicorn/logging.conf /etc/gunicorn/logging.conf

# User permissions
# - Create default user `romm` (1000) and group `romm` (1000).
# - Create base directories and make default user/group the owner.
# - Make nginx configuration files writable by everyone for `envsubst` to work
RUN addgroup -g 1000 -S romm && adduser -u 1000 -D -S -G romm romm && \
    mkdir /romm /redis-data && \
    chown romm:romm /romm /redis-data && \
    chmod 755 /romm /redis-data && \
    chmod -R a+w /etc/nginx/conf.d && \
    chmod -R a+w /etc/gunicorn


# SLIM IMAGE
FROM scratch AS slim-image

COPY --from=production-stage / /

COPY --from=backend-build /src/.venv /src/.venv

# Optional sigil bindings for title ID extraction; the backend feature
# no-ops when the package is absent.
ARG PYTHON_VERSION
COPY --from=sigil-build /sigil-pkg /src/.venv/lib/python${PYTHON_VERSION}/site-packages/sigil

ENV PATH="/src/.venv/bin:${PATH}"

# ScreenScraper developer (application) credentials, injected at build time from
# CI secrets. Kept out of the source tree; empty when not supplied at build.
ARG SCREENSCRAPER_DEV_ID
ARG SCREENSCRAPER_DEV_PASSWORD
ENV SCREENSCRAPER_DEV_ID=${SCREENSCRAPER_DEV_ID}
ENV SCREENSCRAPER_DEV_PASSWORD=${SCREENSCRAPER_DEV_PASSWORD}

# Security: Set security-focused environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/backend

# Declare only the parent `/romm`, not its subdirs, so Docker keeps them 
# on one mount (`st_dev`) and cross-directory `os.link()` hardlinks don't fail.
VOLUME ["/romm", "/redis-data"]

# Expose non-privileged ports
EXPOSE 8080 6379/tcp
WORKDIR /romm

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["/init"]


# FULL IMAGE
FROM slim-image AS full-image
ARG WEBSERVER_FOLDER=/var/www/html
COPY --from=emulator-stage /emulatorjs ${WEBSERVER_FOLDER}/assets/emulatorjs
COPY --from=emulator-stage /ruffle ${WEBSERVER_FOLDER}/assets/ruffle
COPY --from=emulator-stage /jsdos/dist ${WEBSERVER_FOLDER}/assets/jsdos
COPY --from=emulator-stage /fake08 ${WEBSERVER_FOLDER}/assets/pico8


FROM slim-image AS dev-slim
COPY --from=backend-dev-build /src/.venv /src/.venv


FROM full-image AS dev-full
COPY --from=backend-dev-build /src/.venv /src/.venv
