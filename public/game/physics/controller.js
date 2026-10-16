// Physics and finish checks run at the same frequency on every display.
export const SIMULATION_STEP_MS = 1000 / 1000;

export class CarController {
    constructor(scale) {
        this.controls = { left: false, right: false };
        this.position = { x: 0, y: 0, angle: 0 };
        this.scale = 2.78 * scale;
        this.baseSpeed = (1.82 / 16.67) * scale;
        this.baseTurnSpeed = 0.05 / 16.67;
        this.resetClock();
    }

    setPosition(x, y, angle = 0) {
        if (![x, y, angle].every(Number.isFinite)) throw new Error('Invalid car position');
        Object.assign(this.position, { x, y, angle });
    }

    resetClock(timestamp = performance.now()) {
        this.startTime = timestamp;
        this.simulationTime = timestamp;
        this.tick = 0;
        this.inputQueue = [];
        this.simulatedControls = { ...this.controls };
    }

    setControls(left, right, timestamp = performance.now()) {
        const next = { left: Boolean(left), right: Boolean(right) };
        if (next.left === this.controls.left && next.right === this.controls.right) return;
        this.controls = next;
        // Preserve both ends of a pulse even when no frame was rendered between them.
        const previous = this.inputQueue.at(-1)?.timestamp ?? this.simulationTime;
        this.inputQueue.push({ ...next, timestamp: Math.max(timestamp, previous) });
    }

    integrate(duration) {
        const turn = (Number(this.simulatedControls.right) - Number(this.simulatedControls.left)) * this.baseTurnSpeed;
        const angle = this.position.angle;
        const nextAngle = angle + turn * duration;
        // Exact arc integration preserves the path when split at an input event.
        if (turn === 0) {
            this.position.x += Math.cos(angle) * this.baseSpeed * duration;
            this.position.y += Math.sin(angle) * this.baseSpeed * duration;
        } else {
            this.position.x += this.baseSpeed / turn * (Math.sin(nextAngle) - Math.sin(angle));
            this.position.y += this.baseSpeed / turn * (Math.cos(angle) - Math.cos(nextAngle));
        }
        this.position.angle = nextAngle;
    }

    step(timestamp) {
        const end = this.startTime + (this.tick + 1) * SIMULATION_STEP_MS;
        if (end > timestamp + 1e-7) return false;
        let cursor = this.simulationTime;
        while (this.inputQueue.length && this.inputQueue[0].timestamp <= end) {
            const input = this.inputQueue.shift();
            const time = Math.max(cursor, input.timestamp);
            this.integrate(time - cursor);
            this.simulatedControls = { left: input.left, right: input.right };
            cursor = time;
        }
        this.integrate(end - cursor);
        this.tick++;
        this.simulationTime = end;
        return true;
    }

    get elapsedTime() {
        return this.tick * SIMULATION_STEP_MS;
    }
}
