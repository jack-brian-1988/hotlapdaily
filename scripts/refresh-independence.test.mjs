import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const controllerSource = readFileSync(new URL('../public/game/physics/controller.js', import.meta.url), 'utf8');
const { CarController, SIMULATION_STEP_MS } = await import(`data:text/javascript;base64,${Buffer.from(controllerSource).toString('base64')}`);
const engineSource = readFileSync(new URL('../public/game/engine.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?\n/gm, '');
const windowMock = { addEventListener() {} };
const context = vm.createContext({
    window: windowMock, performance, console: { ...console, debug() {}, log() {}, info() {} },
    validateAntiCheatIntegrity: () => true,
});
vm.runInContext(engineSource, context);
const Game = windowMock.Game;

test('production physics uses a one millisecond simulation step', () => {
    assert.equal(SIMULATION_STEP_MS, 1);
});

function controller() {
    const car = new CarController(1);
    car.resetClock(0);
    return car;
}

function replay(hz, events, end = 1000) {
    const car = controller();
    let index = 0;
    for (let frame = 1; frame <= Math.ceil(end * hz / 1000); frame++) {
        const time = Math.min(frame * 1000 / hz, end);
        while (index < events.length && events[index].time <= time) {
            const input = events[index++];
            car.setControls(input.left ?? false, input.right ?? false, input.time);
        }
        while (car.step(time)) { /* Consume all physics ticks before drawing. */ }
    }
    return car;
}

test('timestamped pulses produce the same trajectory at 30–360 Hz', () => {
    const events = [
        { time: 203, right: true }, { time: 367 },
        { time: 401, left: true }, { time: 403 }, // Entire pulse between 60 Hz frames.
        { time: 523, left: true }, { time: 701 },
    ];
    const expected = replay(60, events);
    for (const hz of [30, 75, 120, 144, 165, 240, 360]) {
        const actual = replay(hz, events);
        assert.deepEqual(actual.position, expected.position, `${hz} Hz`);
        assert.ok(Math.abs(actual.elapsedTime - 1000) < 1e-9);
    }
});

test('sub-frame pulse contributes its exact duration to steering', () => {
    const car = replay(60, [{ time: 2, right: true }, { time: 3 }]);
    assert.ok(Math.abs(car.position.angle - car.baseTurnSpeed) < 1e-12);
});

test('reset discards pending inputs and idle time, preserving held controls', () => {
    const car = controller();
    car.setControls(true, false, 25);
    car.resetClock(10000);
    assert.equal(car.step(10000), false);
    assert.equal(car.step(10000 + SIMULATION_STEP_MS), true);
    assert.ok(Math.abs(car.position.angle + car.baseTurnSpeed * SIMULATION_STEP_MS) < 1e-12);
    assert.equal(car.inputQueue.length, 0);
});

function game() {
    const car = controller();
    car.setPosition(100, 100);
    car.setControls(false, true, 0);
    const instance = Object.create(Game.prototype);
    Object.assign(instance, {
        carController: car, car: {}, canvas: { width: 400, height: 400 },
        currentTrack: { checkpoints: [{ x: 100, y: 52 }] },
        lapStarted: true, lapCompleted: false, lapTime: 0, hasLeftStartArea: false,
        gamePaused: false, ghostCurrentTrail: [], _ghostLastSampleMs: 0, _ghostSampleIntervalMs: 50,
        perfMetrics: { updateTimes: [], fps: [] }, lastFrameTime: performance.now(), frameCount: 0,
        antiCheat: { update() {} },
        checkCollision: () => false,
        completeLap() { this.lapCompleted = true; },
        handleCarCrash() { this.lapStarted = false; this.crashed = true; },
        handleGameError(error) { throw error; },
    });
    return instance;
}

test('actual game loop and unchanged circular finish produce identical lap times', () => {
    const results = [];
    for (const hz of [30, 60, 120, 144, 240, 360]) {
        const instance = game();
        for (let frame = 1; frame < hz * 4 && !instance.lapCompleted; frame++) {
            instance.update(frame * 1000 / hz);
        }
        assert.equal(instance.lapCompleted, true);
        assert.equal(instance.hasLeftStartArea, true);
        results.push({ time: instance.lapTime, position: { ...instance.carController.position } });
    }
    for (const result of results) assert.deepEqual(result, results[0]);
});

test('ordinary dropped frames catch up without dropping simulation time', () => {
    const instance = game();
    instance.update(100);
    assert.equal(instance.lapTime, 100);
    assert.equal(instance.carController.tick, 100);
    assert.ok(!instance.crashed);
});

test('a long stall ends the attempt rather than desynchronizing clock and movement', () => {
    const instance = game();
    instance.update(1000);
    assert.equal(instance.crashed, true);
    assert.equal(instance.lapTime, 0);
    assert.equal(instance.carController.tick, 0);
});

function bindInputs() {
    const listeners = new Map();
    const windowListeners = new Map();
    const element = { classList: { add() {}, remove() {} }, style: {}, addEventListener() {}, setPointerCapture() {} };
    context.document = {
        hidden: false,
        addEventListener: (type, callback) => listeners.set(type, callback),
        querySelectorAll: () => [element], getElementById: () => element,
    };
    windowMock.addEventListener = (type, callback) => windowListeners.set(type, callback);
    const instance = game();
    instance.carController = controller();
    instance.bindEvents();
    const send = (type, code, timeStamp, extra = {}) => listeners.get(type)({
        code, timeStamp, preventDefault() {}, ...extra,
    });
    return { instance, send, windowListeners, element };
}

test('keyboard handlers preserve press/release timestamps and overlapping aliases', () => {
    const { instance, send } = bindInputs();
    send('keydown', 'ArrowLeft', 2);
    send('keydown', 'KeyA', 3);
    send('keyup', 'ArrowLeft', 4);
    assert.equal(instance.carController.controls.left, true);
    send('keyup', 'KeyA', 7);
    while (instance.carController.step(20)) { /* Catch up. */ }
    assert.ok(Math.abs(instance.carController.position.angle + 5 * instance.carController.baseTurnSpeed) < 1e-12);
});

test('pointer release preserves a concurrently held keyboard control', () => {
    const { instance, send, element } = bindInputs();
    const target = { closest: (selector) => selector.endsWith('control-left') ? element : null };
    send('keydown', 'KeyA', 2);
    send('pointerdown', null, 3, { target, pointerId: 1 });
    send('pointerup', null, 5, { pointerId: 1 });
    assert.equal(instance.carController.controls.left, true);
    send('keyup', 'KeyA', 7);
    assert.equal(instance.carController.controls.left, false);
});

test('focus loss releases inputs and hiding the page ends an active attempt', () => {
    const { instance, send, windowListeners } = bindInputs();
    send('keydown', 'KeyD', 2);
    windowListeners.get('blur')();
    assert.equal(instance.carController.controls.right, false);
    context.document.hidden = true;
    send('visibilitychange', null, 10);
    assert.equal(instance.crashed, true);
});

// Frozen upstream controller at 3ea61c71a832448d733c3f494e713c7f9d988b28.
// Run the real old update against a deterministic clock, rather than duplicating
// its turn formula in the expected result. Only its opening angle is the contract:
// the old frame-sized movement is intentionally replaced by 1 ms integration.
const originalSource = readFileSync(new URL('./fixtures/original-controller.js', import.meta.url), 'utf8');
function originalOpeningAngle(left, right, angle) {
    let now = 0;
    const originalContext = vm.createContext({
        performance: { now: () => now }, console: { debug() {}, info() {}, error() {} },
    });
    vm.runInContext(originalSource.replace('export class CarController', 'class CarController')
        + '\nthis.OriginalController = CarController;', originalContext);
    const original = new originalContext.OriginalController(1);
    now = 500;
    original.setControls(left, right); // Held well before starting the lap.
    original.setPosition(100, 100, angle);
    now = 1000;
    original.update();
    return original.position.angle;
}

function prepareLap() {
    const inputs = bindInputs();
    const { instance } = inputs;
    instance.lapStarted = false;
    instance.currentTrack.checkpoints[0].angle = 37;
    instance.antiCheat.initializeCheckpoints = () => {};
    instance.antiCheat.reset = () => {};
    // Use a fixed lap epoch without changing production input/clock behavior.
    const resetClock = instance.carController.resetClock.bind(instance.carController);
    instance.carController.resetClock = () => resetClock(10000);
    return inputs;
}

for (const [name, key, left, right] of [
    ['left', 'ArrowLeft', true, false],
    ['right', 'ArrowRight', false, true],
    ['neutral', null, false, false],
]) {
    test(`lap start matches the original capped opening angle: ${name}`, () => {
        for (const viaPointer of [false, true]) {
            const { instance, send, element } = prepareLap();
            if (key) {
                if (viaPointer) {
                    const selector = left ? 'control-left' : 'control-right';
                    send('pointerdown', null, 2, {
                        target: { closest: (value) => value.endsWith(selector) ? element : null }, pointerId: 1,
                    });
                } else send('keydown', key, 2);
            }
            // Idle frames must not erase a held input or consume the opening turn.
            instance.update(100);
            send('keydown', 'Space', 3);
            const car = instance.carController;
            assert.equal(car.position.angle, originalOpeningAngle(left, right, 37 * Math.PI / 180));
            assert.deepEqual(car.controls, { left, right });
            assert.equal(car.elapsedTime, 0);
            assert.equal(instance.lapTime, 0);
            assert.equal(car.position.x, 100);
            assert.equal(car.position.y, 100);
            assert.equal(car.inputQueue.length, 0);
        }
    });

    test(`opening turn and subsequent simulation are refresh independent: ${name}`, () => {
        let expected;
        for (const hz of [30, 60, 75, 120, 144, 165, 240, 360]) {
            const { instance, send } = prepareLap();
            if (key) send('keydown', key, 2);
            send('keydown', 'Space', 3);
            let collisions = 0, checkpoints = 0, finishes = 0;
            instance.checkCollision = () => { collisions++; return false; };
            instance.antiCheat.update = () => { checkpoints++; };
            instance.checkLapCompletion = () => { finishes++; };
            for (let frame = 1; frame <= hz; frame++) instance.update(10000 + frame * 1000 / hz);
            const result = { position: { ...instance.carController.position }, time: instance.lapTime };
            expected ??= result;
            assert.deepEqual(result, expected, `${hz} Hz`);
            assert.equal(instance.carController.tick, 1000);
            assert.equal(collisions, 1000);
            assert.equal(checkpoints, 1000);
            assert.equal(finishes, 1000);
        }
    });
}

test('released inputs and opposing held inputs do not add an opening turn', () => {
    for (const release of [true, false]) {
        const { instance, send } = prepareLap();
        send('keydown', 'ArrowLeft', 2);
        if (release) send('keyup', 'ArrowLeft', 3);
        else send('keydown', 'ArrowRight', 3);
        send('keydown', 'Space', 4);
        assert.equal(instance.carController.position.angle, 37 * Math.PI / 180);
    }
});

test('restarting a lap applies the opening turn once, relative to the track heading', () => {
    const { instance, send } = prepareLap();
    send('keydown', 'KeyA', 2);
    send('keydown', 'Space', 3);
    const expected = instance.carController.position.angle;
    instance.update(10020);
    instance.lapStarted = false;
    send('keydown', 'Space', 4);
    assert.equal(instance.carController.position.angle, expected);
    assert.equal(instance.carController.elapsedTime, 0);
});
