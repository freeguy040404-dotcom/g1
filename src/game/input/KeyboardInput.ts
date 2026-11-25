import { DEFAULT_KEY_BINDINGS, type KeyBindings } from '../settings';

export interface MovementInputState {
  /** -1 (backward/S) to +1 (forward/W) */
  forward: number;
  /** -1 (left/A) to +1 (right/D) */
  right: number;
  /** True while Shift is held */
  run: boolean;
  /** True if a fresh jump press is currently buffered */
  jumpBuffered: boolean;
  /** True while Space is currently held down */
  jumpHeld: boolean;
}

const JUMP_BUFFER_SECONDS = 0.15;

export class KeyboardInput {
  private readonly keys = new Set<string>();
  private jumpBufferTimer = 0;
  private readonly onUserInteract: () => void;

  private bindings: KeyBindings = { ...DEFAULT_KEY_BINDINGS };
  private sensitivity = 1.0;
  private smoothedForward = 0;
  private smoothedRight = 0;

  constructor(onUserInteract: () => void) {
    this.onUserInteract = onUserInteract;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  public setBindings(bindings: KeyBindings): void {
    this.bindings = { ...bindings };
  }

  public setSensitivity(sensitivity: number): void {
    this.sensitivity = Math.min(1.5, Math.max(0.5, sensitivity));
  }

  public clearInputs(): void {
    this.keys.clear();
    this.jumpBufferTimer = 0;
    this.smoothedForward = 0;
    this.smoothedRight = 0;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    const { code } = event;
    if (
      code === 'Space' ||
      code === this.bindings.jump ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      event.preventDefault();
    }

    if (
      code === this.bindings.forward ||
      code === this.bindings.backward ||
      code === this.bindings.left ||
      code === this.bindings.right ||
      code === this.bindings.jump ||
      code === this.bindings.run ||
      code === 'ShiftLeft' ||
      code === 'ShiftRight'
    ) {
      this.onUserInteract();
    }

    if (code === this.bindings.jump && !event.repeat && !this.keys.has(code)) {
      this.jumpBufferTimer = JUMP_BUFFER_SECONDS;
    }

    this.keys.add(code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly handleBlur = (): void => {
    this.clearInputs();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearInputs();
    }
  };

  public tick(dt: number): void {
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    const rawForward =
      (this.keys.has(this.bindings.forward) || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has(this.bindings.backward) || this.keys.has('ArrowDown') ? 1 : 0);
    const rawRight =
      (this.keys.has(this.bindings.right) || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has(this.bindings.left) || this.keys.has('ArrowLeft') ? 1 : 0);

    // Keyboard sensitivity controls input ramp responsiveness (0.5 = gentle, 1.0 = crisp, 1.5 = instant)
    if (this.sensitivity >= 1.25) {
      this.smoothedForward = rawForward;
      this.smoothedRight = rawRight;
    } else {
      const rate = 6 + this.sensitivity * 14;
      const alpha = 1 - Math.exp(-rate * dt);
      this.smoothedForward += (rawForward - this.smoothedForward) * alpha;
      this.smoothedRight += (rawRight - this.smoothedRight) * alpha;
      if (Math.abs(this.smoothedForward) < 0.01 && rawForward === 0) this.smoothedForward = 0;
      if (Math.abs(this.smoothedRight) < 0.01 && rawRight === 0) this.smoothedRight = 0;
    }
  }

  public consumeJumpBuffer(): boolean {
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = 0;
      return true;
    }
    return false;
  }

  public getState(out: MovementInputState): MovementInputState {
    const runHeld =
      this.keys.has(this.bindings.run) ||
      (this.bindings.run === 'ShiftLeft' && this.keys.has('ShiftRight')) ||
      (this.bindings.run === 'ShiftRight' && this.keys.has('ShiftLeft'));

    out.forward = this.smoothedForward;
    out.right = this.smoothedRight;
    out.run = runHeld;
    out.jumpBuffered = this.jumpBufferTimer > 0;
    out.jumpHeld = this.keys.has(this.bindings.jump);
    return out;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.keys.clear();
  }
}
