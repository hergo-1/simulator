# SECURITY — hardened fork

This repository is a hardened fork of [Nyxera0x/simulator](https://github.com/Nyxera0x/simulator)
(MIT, licence preserved in `LICENSE`). It was reviewed and modified before any of its code was
run, and the differences below are the whole point of this fork.

## The isolated-run rule

Even hardened, this kit executes code (esbuild bundling, a headless browser, ffmpeg, Python
synthesis). **Run it only in an isolated, disposable environment** — never on a machine that
holds projects, accounts or credentials, and never with API keys or `.env` files nearby.

## What was changed, and why

1. **Install runs nothing extra.** The upstream setup installed dependencies and then downloaded
   a bundled browser. Here `package.json`'s setup is `npm ci --ignore-scripts`: dependencies
   install with their install scripts disabled, and no browser is ever downloaded — capture
   uses the system Chromium instead.
2. **A lockfile is committed.** Upstream shipped no `package-lock.json`, so an install could
   resolve different transitive versions than the ones reviewed. `package-lock.json` is now
   generated once (on the isolated test machine, `--ignore-scripts --package-lock-only`) and
   committed; `npm ci` installs exactly those versions.
3. **No API keys, no key-file reading.** Upstream `tools/music.py` looked up an online music
   service's API key in the environment and in key files on disk and called that service. That
   code is deleted. `tools/music.py` now only mixes a music file you pass with `--music`, or the
   score's own procedural bed. Nothing in this tree reads a key from anywhere. (The upstream
   composition-plan file for that service went with it.)
4. **No sound downloads.** An upstream tool downloaded audio files from URLs returned by an
   external audio API and processed them with ffmpeg. It is deleted, with all its references.
   Sound here is the local procedural `sfx/` kit only; any ambience is a local file you supply
   yourself.
5. **No external code execution.** Upstream `sims/capture.mjs` would open and execute any
   `.html` file path it was given, and `sims/build.mjs` would bundle any folder on disk. Both
   now accept only plain sim names that live inside `sims/` / were built into
   `simulator-out/dist` by this repo, and refuse paths with a clear error.
6. **No environment-controlled binaries.** Upstream `paths.mjs` took `FFMPEG`, `FFPROBE`,
   `PYTHON`, `CHROMIUM`, the dependency folder and the output folder from environment variables —
   a polluted environment could substitute a different program. `paths.mjs` now uses fixed
   values: `ffmpeg`, `ffprobe`, `python3`, the system Chromium at a fixed path, this folder's own
   `node_modules`, and `./simulator-out`.

## Known remaining surfaces (accepted, hence the isolated-run rule)

- Dependencies themselves (three, esbuild, playwright, fonts) are third-party code; the lockfile
  pins them but does not audit them.
- Capture executes this repo's own built pages in a headless browser; that is the tool's job.
- ffmpeg still processes media files you feed the mixer; feed it only files you trust.
