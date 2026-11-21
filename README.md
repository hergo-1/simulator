<h1 align="center">simulator</h1>

<p align="center"><b>Any industry as a live simulator you can watch run itself.</b><br>
A Claude Code skill. Every model, every machine and every frame is code.</p>

<p align="center"><img src="docs/hero.gif" alt="Four simulators: an airport, a car plant, a construction site and a warehouse network" width="100%"></p>

<p align="center">
<b>4 systems inside</b> &nbsp;·&nbsp; <b>64 models built by subagents</b> &nbsp;·&nbsp; <b>13,700 lines</b> &nbsp;·&nbsp; <b>no 3D files, no downloads</b>
</p>

---

## What it makes

You name a system. Claude builds the whole operation as one offline HTML page: a toy-scale isometric world where every
vehicle works on one clock, one item followed from the first second to the last, a product app over the map, one
camera that pans and zooms like a person with a mouse. Then it checks that nothing drives through anything and
records the page frame by frame into a 60 fps film with a sound on every action.

<table>
<tr>
<td width="50%"><img src="docs/airport.gif" alt="Rampline: a tug tows a container to the cargo terminal"><br><b>Rampline</b> · an airport<br><sub>A container leaves the hold on a high loader, rides a tug train to Cargo C and goes in on a forklift. Pushback, catering, a taxi out.</sub></td>
<td width="50%"><img src="docs/plant.gif" alt="Plantline: robots weld a car body in cell C4"><br><b>Plantline</b> · a car plant<br><sub>Four robots weld a body in cell C4. It rides to the paint booth, gets its wheels, seats and glass, passes the rolling road and drives onto a carrier.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/site.gif" alt="Buildline: a mixer truck pours the foundation slab"><br><b>Buildline</b> · a construction site<br><sub>The pit digs itself, a dozer levels the floor, the rebar rolls out, a mixer from the batching plant backs down the ramp and the slab spreads from its chute.</sub></td>
<td width="50%"><img src="docs/warehouse.gif" alt="Stockline: a box truck docks and a forklift unloads it"><br><b>Stockline</b> · a warehouse network<br><sub>A truck loads at Harbor Hub, drives to the cross-dock, reverses into In 3 and a forklift unloads it. The site switcher jumps to the cold store.</sub></td>
</tr>
</table>

## The 5 rules every simulator follows

| | |
|---|---|
| **One camera** | One angle for the whole film. It only pans and zooms. No cuts. |
| **Toy scale** | A forklift nearly as tall as the dock door. Big simple shapes, generous bevels, nothing sharp. |
| **Two colours** | Blue and white on a lavender ground. Yellow only on the working machines. |
| **Real software on top** | A site switcher with a dropdown, live cards, a tracker, a fleet table. Every number reads from the scene. |
| **Game-style selection** | A wireframe box round the vehicle you clicked, a glow under it, its route drawn on the ground. |

<p align="center"><img src="docs/airport_dropdown.gif" alt="The site switcher's dropdown jumps to another stand" width="80%"></p>

## Install

This is a hardened fork of [Nyxera0x/simulator](https://github.com/Nyxera0x/simulator) — see
[`SECURITY.md`](SECURITY.md) for every difference and why. Clone this fork, then, once, in the
installed folder:

```
npm ci --ignore-scripts
```

Dependencies install exactly from the committed `package-lock.json`, with install scripts
disabled, and there is no browser download: capture uses the system Chromium.

Node.js 20 or newer. `ffmpeg` for the video, Python 3 for the sound. There are no API keys and no
downloads: the films get a calm procedural code bed under their action sounds, or a music file
you supply yourself.

## Use

Type `/simulator` in Claude Code, or ask in plain words:

> Take this video apart and rebuild a parcel hub in its format. Follow one parcel from the truck to the van.

> Build a pizza factory as a live simulator in the airport's style: one order from the dough to the scooter.

> Make a bakery line simulator. Follow one tray from the oven to the delivery truck.

Or open an example first:

```
node sims/build.mjs warehouse-film       # simulator-out/dist/warehouse-film.html, open it in a browser
node sims/capture.mjs warehouse-film --size 1600x900 --dpr 1.2 --out simulator-out/warehouse.mp4
```

## How a new system gets built

1. **Pin the look down.** Frames from a video with the look you want, colours sampled with ffmpeg, the interface
   measured panel by panel. Rules, no opinions.
2. **Brief 2 subagents.** One file with the frames, the palette and a scale contract both kits must meet (door sills,
   deck heights). One builds the buildings, one the vehicles. Template: [`docs/BRIEF.md`](docs/BRIEF.md).
3. **Write the day as a function of time.** One hero item's timetable, every vehicle on a path by distance. Render
   any second out of order and it looks the same.
4. **Direct it like a user.** One angle, eased glides between sites, clicks that open the detail card, a dropdown
   for the site switch.
5. **Sweep for collisions.** Every 0.1 s, oriented boxes from each body's own geometry. Fix the paths until it
   reports nothing.
6. **Score it and render it.** Sounds on the same timetable, synthesised locally, 60 fps frame by frame.

## What is inside

| | |
|---|---|
| `SKILL.md` | What Claude reads: the whole method, the render(t) contract, the review loop. |
| `docs/BRIEF.md` | The brief the model subagents work from, as a template. |
| `sims/airport-shared/` | Rampline, plus the shared look: palette, materials, stage, the product UI, selection marks, thumbnails. |
| `sims/plant-shared/` | Plantline: robot arms with IK, a car body that builds in stages, conveyors, a press, a paint booth, a rolling road, the hall, AGVs, a car carrier. |
| `sims/site-shared/` | Buildline: an excavator with IK, a tipper, a mixer, a dozer, a loader, a roller; a pit that digs itself, rebar, formwork, a slab that pours, blockwork. |
| `sims/warehouse-shared/` | Stockline: three warehouses, docks, trucks, forklifts, staging rows, chargers. |
| `sims/*-film/` | Each film's entry point and timeline. |
| `sims/*-collide/` | Each system's collision sweep. |
| `sims/build.mjs`, `sims/capture.mjs` | Bundle a system into one HTML file; render it to a 60 fps mp4 or review sheets. |
| `sfx/`, `run_sfx.py`, `tools/` | Procedural sound on the timeline (local synthesis only, nothing downloaded), and the final mix with a supplied music file or the score's own bed. |

## License

MIT
