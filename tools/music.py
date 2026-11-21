"""Put the sound under a rendered film: a music track, the film's own action sounds and local ambience, mixed and muxed.

    python tools/music.py --film simulator-out/airport-film.mp4 --score sims/airport-shared/score.py --out simulator-out/airport-final.mp4
        [--ambience apron.wav --ambience jets.wav] [--music track.mp3] [--offset 0]

HARDENED (see SECURITY.md): there is no online music generation and no API key is read from anywhere —
no environment lookup, no .env files. Where the music comes from, first match wins:
1. --music: a track you already have locally.
2. Neither: the score renders its own procedural bed in code (BED=1) and there is no separate track.

The action sounds come from --score (any cue sheet with score(mix, tl), rendered by run_sfx.py from the
local procedural sfx/ kit only), brought to -23.4 LUFS and lifted --fx-db over that. Ambience files are
local recordings you supply yourself; they loop under everything at --amb-lufs. Nothing is downloaded.
The video stream is copied as it is.
"""
import argparse
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from sfx.__main__ import load_cues  # noqa: E402

# Fixed binary/output (hardened paths: never taken from the environment).
FF = "ffmpeg"
OUT = "simulator-out"


def gaps(path, start, dur):
    err = subprocess.run([FF, "-hide_banner", "-ss", f"{start}", "-t", f"{dur}", "-i", path, "-af", "silencedetect=noise=-35dB:d=0.25",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    return re.findall(r"silence_start: ([\d.]+)", err)


def lufs(path):
    err = subprocess.run([FF, "-hide_banner", "-i", path, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    return float(m[-1]) if m else None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--film", required=True, help="the rendered video (no sound needed)")
    ap.add_argument("--score", required=True, help="the cue sheet with score(mix, tl)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--timeline", help="default: the cue sheet's TIMELINE")
    ap.add_argument("--music", help="an existing local track instead of the score's own bed")
    ap.add_argument("--offset", type=float, default=0.0, help="start the track this many seconds in")
    ap.add_argument("--ambience", action="append", default=[], help="a local recording looped under everything (repeat for more)")
    ap.add_argument("--amb-lufs", type=float, default=-30.0, help="each ambience file's level (default -30)")
    ap.add_argument("--music-lufs", type=float, default=-15.0, help="the music's level in the mix (default -15)")
    ap.add_argument("--fx-db", type=float, default=4.0, help="the action sounds over -23.4 LUFS (default +4 dB)")
    ap.add_argument("--fade", type=float, default=0.6, help="fade-out length in seconds")
    a = ap.parse_args()

    cues = load_cues(a.score)
    timeline = a.timeline or os.path.join(os.path.dirname(os.path.abspath(a.score)), getattr(cues, "TIMELINE", "timeline.json"))
    tl = json.load(open(timeline, encoding="utf-8"))
    dur = tl["duration"]
    stem = os.path.splitext(os.path.basename(a.out))[0]
    os.makedirs(OUT, exist_ok=True)

    music = a.music
    if not music:
        print("no --music: the score plays its own procedural bed (BED=1)")
    if music:
        g = gaps(music, a.offset, dur)
        if g:
            print("WARNING: silence in the track at", ", ".join(g), "s from the offset; make a new one before posting")

    fx = os.path.join(OUT, f"{stem}_fx.wav")
    env = dict(os.environ, BED="" if music else "1")
    subprocess.run([sys.executable, os.path.join(ROOT, "run_sfx.py"), a.score, "--timeline", timeline, "--out", fx], check=True, env=env)
    level = lufs(fx)
    fx_gain = (-23.4 - level + a.fx_db) if (music and level is not None) else 0.0

    args, chains, labels = [FF, "-y", "-hide_banner", "-loglevel", "error", "-i", a.film], [], []
    n = 1
    if music:
        args += ["-i", music]
        chains.append(f"[{n}:a]atrim={a.offset}:{a.offset + dur},asetpts=PTS-STARTPTS,aresample=48000,loudnorm=I={a.music_lufs}:TP=-2:LRA=11[m]")
        labels.append("[m]")
        n += 1
    args += ["-i", fx]
    chains.append(f"[{n}:a]aresample=48000,volume={fx_gain:.1f}dB[f]")
    labels.append("[f]")
    n += 1
    for k, amb in enumerate(a.ambience):
        args += ["-stream_loop", "-1", "-i", amb]
        chains.append(f"[{n}:a]atrim=0:{dur},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,loudnorm=I={a.amb_lufs}:TP=-6[a{k}]")
        labels.append(f"[a{k}]")
        n += 1
    fade = max(0.0, dur - a.fade)
    chains.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0,alimiter=limit=0.9:level=false,afade=t=out:st={fade:.2f}:d={a.fade}[a]")
    args += ["-filter_complex", ";".join(chains), "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-ar", "48000", "-ac", "2",
             "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", f"{dur}", a.out]
    subprocess.run(args, check=True)
    os.remove(fx)
    print("wrote", a.out)


if __name__ == "__main__":
    main()
