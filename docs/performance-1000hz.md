# Performance at 1000 steps/s

Local measurement from October 15, 2026, in the Codex in-app browser using
the Next.js production build. Observed display cadence: 60 Hz. Game viewport:
855 × 708 CSS pixels; internal canvas: 152 × 114; devicePixelRatio: 1.25.
The canvas retains the dimensions calculated by the application.

The benchmark runs the real page, including controls, simulation, checkpoints,
collisions, ghost sampling, timer, HUD and rendering. An automated controller
keeps the car on the current local track. The same five-point fallback track
is used in every phase. There were no crashes or DNFs, and the car remained
active throughout all samples.

The benchmark alternates 240 → 1000 → 1000 → 240 steps/s, with 2 seconds of
warm-up and 10 seconds of measurement per phase. The finish boundary remains
the original circular area. Only lap-completion side effects are replaced in
the temporary benchmark instance to avoid submitting lap times.

| Phase | Steps/s | FPS | Update, mean / p95 (ms) | Draw, mean / p95 (ms) | Interval p95 (ms) | Frames >25 ms |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 240 | 60.00 | 0.78 / 1.20 | 0.52 / 0.70 | 16.80 | 0 |
| 2 | 1000 | 59.80 | 2.77 / 3.90 | 0.57 / 0.80 | 16.80 | 2 |
| 3 | 1000 | 59.90 | 3.37 / 5.70 | 0.67 / 1.00 | 16.80 | 1 |
| 4 | 240 | 60.00 | 0.53 / 0.80 | 0.38 / 0.50 | 16.80 | 0 |

Averaging the two phases at each frequency, updating and drawing consume
approximately 1.10 ms per frame at 240 steps/s and 3.69 ms at 1000 steps/s.
The game stays close to 60 FPS, with three frames exceeding 25 ms during
the 20 seconds measured at 1000 steps/s.

Update/draw times are JavaScript timings measured with `performance.now()`,
not GPU timings. Intervals between `requestAnimationFrame` calls indicate
the full game's cadence; they do not measure the monitor's physical presentation
time. Instrumentation and game logging also add overhead. These are short
tests on this machine with the simple track available locally; they do not
guarantee the same results on mobile devices, other machines, different
resolutions or denser tracks.

## Reproducing the measurement

Start the production build (`npm run build`, then
`npm run start -- --hostname 127.0.0.1`) with a supported Node.js version.
Open http://127.0.0.1:3000/benchmarks/refresh.html, click "Compare 240 and 1000
steps/s" and keep the tab visible without interacting for approximately 48
seconds. The table and detailed data appear when the benchmark finishes.
The normal game configuration remains at 1000 steps/s; the comparison only
modifies its own iframe.

Additional checks at the time of the measurement: ten automated tests passed,
including 1 ms resolution and identical results from 30 to 360 Hz. The production
build succeeded with the project's existing warnings. `checkLapCompletion`
retains its original implementation. The later opening-turn regression tests
are documented in `lap-start-steering.md`.

During preparation, an existing page `onLoad` bug was corrected: it cleared
the reference to the newly created instance without stopping it. The existing
instance is now reused so the page and benchmark operate on the same game.
