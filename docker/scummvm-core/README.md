# ScummVM core staging directory

`scummvm-thread-wasm.data`, `scummvm-thread-legacy-wasm.data` and the core
report `scummvm.json` in this directory are NOT committed (all covered by
`.gitignore` globs). They're
staged here by the `scummvm-wasm` project's `build/deploy-to-romm.sh` script
before running `docker build`, so that `docker/Dockerfile`'s `emulator-stage`
can `COPY` both into the image alongside the official EmulatorJS release's
own core files.

Build the core first: https://github.com/TRusselo/scummvm-wasm

## Recommended `config.yml` settings for this core

EmulatorJS reads per-core defaults from ROMM's `emulatorjs.settings` block.
Values must be the exact strings EmulatorJS's settings menu uses (for the
on/off options that is `enabled` / `disabled`; anything else shows up as
"undefined" in the menu and is treated as off):

```yaml
emulatorjs:
  settings:
    scummvm:
      lockMouse: enabled       # point-and-click games want a captured pointer
                               # (redundant since 2026-09-12: the core's own
                               #  core.json declares supportsMouse, so this is
                               #  already the default. Harmless to keep.)
      vsync: disabled          # smoother for ScummVM's variable-rate engines
      rewindEnabled: disabled  # see below
```

`rewindEnabled` matters more than it looks. ROMM turns rewind on for every
core, RetroArch assumes a core supports rewind when no core-info file says
otherwise, and it then calls `retro_serialize` every `rewind_granularity`
(6) frames. This core implements savestates as a real ScummVM engine save
to a scratch slot, so rewind means a full engine save ten times a second
during play.
