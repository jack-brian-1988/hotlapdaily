const frame = document.querySelector('#game');
const status = document.querySelector('#status');
const button = document.querySelector('#run');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const percentile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};
const average = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
button.disabled = true;
let game;
while (!(game = frame.contentWindow.__hotlapGameInstance)?.currentTrack?.checkpoints?.length) {
    const win = frame.contentWindow;
    if (typeof win.__hotlapInitGame === 'function' && !game && frame.contentDocument.readyState === 'complete') win.__hotlapInitGame();
    status.textContent = `Preparando: documento ${frame.contentDocument.readyState}, motor ${typeof win.Game}, instancia ${Boolean(game)}, inicializado ${Boolean(win.__hotlapInitialized)}, circuito ${game?.currentTrack?.name ?? 'pendiente'}`;
    await sleep(100);
}
button.disabled = false;
status.textContent = 'Ready. Keep this tab visible during measurement.';

button.addEventListener('click', async () => {
    button.disabled = true;
    // Keep the complete game visible at the normal browser viewport size.
    frame.scrollIntoView({ block: 'start' });
    const win = frame.contentWindow;
    const original = { controller: game.carController, update: game.update, draw: game.draw, completeLap: game.completeLap };
    const results = [];
    const scale = original.controller.baseSpeed / (1.82 / 16.67);
    const source = await (await fetch('/game/physics/controller.js', { cache: 'no-store' })).text();
    try {
        // Only replace completion side effects in this temporary benchmark instance.
        // The real circular finish test continues to run in Game.update.
        game.completeLap = function () { this.lapStarted = false; this.lapCompleted = true; };
        for (const frequency of [240, 1000, 1000, 240]) {
            status.textContent = `Measuring ${frequency} steps/s (phase ${results.length + 1}/4)…`;
            const blob = new Blob([source.replace('1000 / 1000', `1000 / ${frequency}`)], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            const { CarController } = await import(url);
            URL.revokeObjectURL(url);
            game.carController = new CarController(scale);
            // The comparison module is imported by the parent document, while
            // RAF and input belong to the iframe's performance time origin.
            const resetClock = game.carController.resetClock;
            game.carController.resetClock = function (timestamp = win.performance.now()) {
                return resetClock.call(this, timestamp);
            };
            const setControls = game.carController.setControls;
            game.carController.setControls = function (left, right, timestamp = win.performance.now()) {
                return setControls.call(this, left, right, timestamp);
            };
            let target = 1;
            let measuring = false;
            let lastTimestamp;
            let steps = 0;
            let crashes = 0;
            const updates = [], draws = [], intervals = [], active = [];
            const step = game.carController.step;
            game.carController.step = function (timestamp) {
                const advanced = step.call(this, timestamp);
                if (measuring && advanced) steps++;
                return advanced;
            };
            game.update = function (timestamp) {
                if (!this.lapStarted) {
                    if (measuring && this.crashed) crashes++;
                    this.startLap();
                    target = 1;
                }
                const points = this.currentTrack.checkpoints;
                const position = this.carController.position;
                const yOffset = this.canvas.height * 0.12;
                let point = points[target % points.length];
                if (Math.hypot(point.x - position.x, point.y + yOffset - position.y) < 22 * scale) {
                    target++;
                    point = points[target % points.length];
                }
                const desired = Math.atan2(point.y + yOffset - position.y, point.x - position.x);
                const error = Math.atan2(Math.sin(desired - position.angle), Math.cos(desired - position.angle));
                this.carController.setControls(error < -0.025, error > 0.025, win.performance.now());
                const start = performance.now();
                original.update.call(this, timestamp);
                if (measuring) {
                    updates.push(performance.now() - start);
                    active.push(this.lapStarted || this.lapCompleted ? 1 : 0);
                    if (lastTimestamp !== undefined) intervals.push(timestamp - lastTimestamp);
                    lastTimestamp = timestamp;
                }
            };
            game.draw = function () {
                const start = performance.now();
                original.draw.call(this);
                if (measuring) draws.push(performance.now() - start);
            };
            game.startLap();
            await sleep(2000);
            if (document.hidden) throw new Error('The tab was hidden; repeat the benchmark with the tab in the foreground.');
            measuring = true;
            const start = performance.now();
            await sleep(10000);
            const seconds = (performance.now() - start) / 1000;
            measuring = false;
            if (document.hidden) throw new Error('The tab was hidden; repeat the benchmark with the tab in the foreground.');
            results.push({
                frequency, seconds, frames: updates.length, fps: intervals.length * 1000 / intervals.reduce((a, b) => a + b, 0),
                updateMeanMs: average(updates), updateP95Ms: percentile(updates, 0.95),
                drawMeanMs: average(draws), drawP95Ms: percentile(draws, 0.95),
                frameIntervalP95Ms: percentile(intervals, 0.95), framesOver25Ms: intervals.filter(ms => ms > 25).length,
                stepsPerSecond: steps / seconds, activeFraction: average(active), crashes,
                trackPoints: game.currentTrack.checkpoints.length,
                canvas: [game.canvas.width, game.canvas.height], viewport: [win.innerWidth, win.innerHeight],
                devicePixelRatio: win.devicePixelRatio,
            });
            document.querySelector('#details').textContent = JSON.stringify(results, null, 2);
        }
        document.querySelector('#results').innerHTML = '<table><tr><th>Steps/s</th><th>FPS</th><th>Update mean / p95</th><th>Draw mean / p95</th><th>Frames &gt;25 ms</th></tr>' + results.map(r =>
            `<tr><td>${r.frequency}</td><td>${r.fps.toFixed(1)}</td><td>${r.updateMeanMs.toFixed(2)} / ${r.updateP95Ms.toFixed(2)} ms</td><td>${r.drawMeanMs.toFixed(2)} / ${r.drawP95Ms.toFixed(2)} ms</td><td>${r.framesOver25Ms}</td></tr>`).join('') + '</table>';
        status.textContent = 'Benchmark complete. The normal configuration remains at 1000 steps/s.';
    } catch (error) {
        status.textContent = `Benchmark interrupted: ${error.message}`;
    } finally {
        game.update = original.update;
        game.draw = original.draw;
        game.completeLap = original.completeLap;
        game.carController = original.controller;
        game.resetGame();
        button.disabled = false;
    }
});
