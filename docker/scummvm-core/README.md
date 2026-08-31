# ScummVM core staging directory

`scummvm-thread-wasm.data` and `scummvm-thread-legacy-wasm.data` in this
directory are NOT committed (both covered by the `.gitignore` glob). They're
staged here by the `scummvm-wasm` project's `build/deploy-to-romm.sh` script
before running `docker build`, so that `docker/Dockerfile`'s `emulator-stage`
can `COPY` both into the image alongside the official EmulatorJS release's
own core files.

Build the core first: https://github.com/TRusselo/scummvm-wasm
