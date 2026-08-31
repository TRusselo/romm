# ScummVM core staging directory

`scummvm-thread-wasm.data` in this directory is NOT committed (see
`.gitignore`). It's staged here by the `scummvm-wasm` project's
`build/deploy-to-romm.sh` script before running `docker build`, so that
`docker/Dockerfile`'s `emulator-stage` can `COPY` it into the image
alongside the official EmulatorJS release's own core files.

Build the core first: https://github.com/TRusselo/scummvm-wasm
