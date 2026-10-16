# Lap-start steering regression

Compared fork commit `212fd753d7242d4e8f9aaf4f371d6bab0476a662` with
`3ea61c71a832448d733c3f494e713c7f9d988b28`, the upstream HEAD reported by
`git ls-remote https://github.com/metapodder/hotlapdaily.git HEAD` during review.
The latter is also the fork commit's parent. The original controller is frozen
in `scripts/fixtures/original-controller.js` for regression comparisons.

## Cause

The original `startLap()` preserved the held controls and reset the position,
but did not reset the controller's `lastUpdateTime`. Its first `update()` used
`Math.min(currentTime - lastUpdateTime, 100)`, turning before moving. After an
idle interval, a held direction therefore contributed a 100 ms opening turn.
The entire interval used the controls held at that update, even if the key had
only recently been pressed.

The 1000 Hz change resets the simulation clock both while idle and at lap start.
`resetClock()` correctly copies held controls into `simulatedControls` and clears
queued events. `setControls()` then correctly ignores the unchanged restored
state. Inputs were not lost: the old accumulated time was removed, along with
its visible opening turn.

The old trajectory also depended on the first frame. With a held right turn,
after 50 ms the original controller gives approximately 0.34993, 0.39992 and
0.42492 radians at 30, 60 and 120 Hz respectively after a long idle interval.
Exact reproduction of all those trajectories conflicts with refresh independence.
The agreed reference is the original capped 100 ms **opening angle**, fixed at
lap start, rather than the old frame-dependent movement.

## Correction

`startLap()` adds `(right - left) * baseTurnSpeed * 100` to the track heading
when resetting the starting position. This is approximately -0.29994 radians
for left, +0.29994 for right, and zero for neither or both. It is applied once
per start, independent of idle duration, and adds no movement or lap time.

The controller, timestamped input queue, 1 ms stepping, and finish detection
remain unchanged. Collision, checkpoint and finish checks still execute on
each physics step.

## Verification

Run `npm run test:physics` (or directly
`node --test scripts/refresh-independence.test.mjs`). Tests compare opening
angles against the executable original controller with a deterministic clock,
exercise held keyboard and pointer inputs before starting, released and opposing
inputs, and repeated starts. Trajectories and lap times are compared at
30, 60, 75, 120, 144, 165, 240 and 360 Hz; each run also checks exactly 1000
collision, checkpoint and finish evaluations per simulated second. Existing
finish, input pulse, dropped-frame and focus-loss tests remain in the suite.
