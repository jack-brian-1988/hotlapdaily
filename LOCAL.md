# Running locally on Windows

Open `start-local.cmd` and visit http://127.0.0.1:3000. Keep the server window
open; press Ctrl+C to stop it.

The launcher uses the modern Node.js bundled with Codex when available,
because the Node.js 17 installation on the original test machine was too old.
Other machines require Node.js 20 or newer and `npm ci` first.

Data is stored locally in `.data/`, which Git ignores. PostgreSQL and credentials
are not required to play. The admin dashboard requires `PASSWORD_ADMIN` in
an `.env.local` file.

The original project is https://github.com/metapodder/hotlapdaily. When working
on your own fork, use `origin` for the fork and `upstream` for the original.
Forks of public GitHub repositories are also public.

## Refresh-independent simulation

Physics, collisions, checkpoints and the finish area are evaluated at 1000
steps per second (1 ms per step), regardless of the display refresh rate.
Keyboard and pointer inputs retain their timestamps and split movement at
each input change. The original base speeds and circular finish area remain.

Dropped frames are recovered by simulating pending steps. Hiding the tab or
stalling for more than 250 ms ends the attempt as a DNF; losing focus releases
the controls to prevent stuck steering.

With a supported Node.js version, `npm run test:physics` checks refresh
independence and input handling. The bundled Codex Node.js executable can also
be used, as shown in `scripts/start-local.ps1`.

To repeat the full-game browser comparison, open
`http://127.0.0.1:3000/benchmarks/refresh.html` and click the comparison button.
The benchmark uses the current local track, keeps the game visible and
alternates 240, 1000, 1000 and 240 steps/s, warming up before each measurement.
It reports FPS, update/draw costs and frames longer than 25 ms. Keep the tab
visible and avoid interacting during measurement. Automated driving only
affects the temporary benchmark instance and does not submit lap times.

## Checking the opening turn

Open the game, hold Left/A or Right/D, then press Space while continuing to
hold the direction. The initial heading includes the fixed opening turn
equivalent to 100 ms of original steering. Compare it with starting without
a held direction. See `docs/lap-start-steering.md` for the regression analysis.
