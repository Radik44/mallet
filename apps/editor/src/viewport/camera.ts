// Fly camera in Source's Z-up, right-handed world. Hammer-style controls:
// hold the middle mouse button to look (the right one opens the context
// menu, as in the 2D views where the middle button pans), WASD to move, Space/C up and down,
// Shift fast, Ctrl slow, wheel changes the base speed.

import { mat4, vec3, type Mat4 } from "wgpu-matrix";
import { invoke } from "@tauri-apps/api/core";

const DEG = Math.PI / 180;

export class FlyCamera {
  position = vec3.create(0, -512, 128);
  /** Degrees, 0 looks along +X, 90 along +Y. */
  yaw = 90;
  /** Degrees, positive looks up. */
  pitch = -10;
  fovDeg = 75;
  near = 4;
  far = 65536;
  speed = 500;
  /** A tool may take the wheel (true = consumed); otherwise it sets the flight speed. */
  wheelHook: ((e: WheelEvent) => boolean) | null = null;
  /** Told the new flight speed after the wheel changes it (shown and remembered, as Unreal's camera speed). */
  onSpeed: ((speed: number) => void) | null = null;

  private keys = new Set<string>();
  private looking = false;
  /** Unity/Unreal style: WASD flies only while the look button is held, so letter shortcuts never move the camera. */
  flyOnlyWhileLooking = readFlyHold();
  /** True while the middle button holds the look: keyboard shortcuts stay quiet then. */
  isLooking(): boolean {
    return this.looking;
  }
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.keys.add(e.code);
    if (["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onBlur = () => this.keys.clear();

  attach(canvas: HTMLCanvasElement) {
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    // In the app the shell keeps the cursor: hidden by a style, confined to the
    // window, warped back to the middle before it reaches an edge and put back
    // where the look began on release. No web Pointer Lock there, so no
    // "press Esc to show your cursor" banner. The browser build keeps the lock.
    const native = "__TAURI_INTERNALS__" in window;
    let start: [number, number] = [0, 0];
    let centre: [number, number] | null = null;
    const nativeCapture = (on: boolean) => {
      document.documentElement.classList.toggle("look-capture", on);
      void invoke("cursor_capture", { on, x: start[0], y: start[1] }).catch(() => undefined);
    };
    // The lock is granted asynchronously. A short middle click releases the
    // button before the lock arrives, so every place that learns about the
    // lock checks whether the button is still down and lets go otherwise;
    // without that the cursor stayed hidden after a quick click.
    const release = () => {
      if (native) {
        if (document.documentElement.classList.contains("look-capture")) nativeCapture(false);
        centre = null;
        return;
      }
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
    // No autoscroll cursor on the middle button.
    canvas.addEventListener("auxclick", (e) => e.preventDefault());
    // Looking never depends on the lock: the camera turns from the mouse's
    // movement deltas while the middle button is held whether or not the lock
    // arrived. The lock only hides the cursor and keeps it off the screen
    // edge; Chromium refuses a request while the previous exit is still in
    // flight, so a refused request is tried again while the button is down.
    const lock = (tries: number) => {
      if (native) {
        if (this.looking) nativeCapture(true);
        return;
      }
      if (!this.looking || document.pointerLockElement === canvas) return;
      let req: unknown;
      try {
        req = canvas.requestPointerLock();
      } catch {
        return;
      }
      if (req instanceof Promise) {
        req
          .then(() => {
            if (!this.looking) release();
          })
          .catch(() => {
            if (tries > 0) setTimeout(() => lock(tries - 1), 80);
          });
      }
    };
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.looking = true;
        start = [e.clientX, e.clientY];
        lock(5);
      } else if (!this.looking) {
        release();
      }
      canvas.focus();
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 1) {
        this.looking = false;
        release();
      }
    });
    window.addEventListener("mousemove", (e) => {
      if (!this.looking) {
        if (document.pointerLockElement === canvas) release();
        return;
      }
      if ((e.buttons & 4) === 0) {
        this.looking = false;
        release();
        return;
      }
      if (native && centre) {
        // A warp is on its way: the moves until the cursor shows up at the middle are its doing, not the hand's.
        if (Math.abs(e.clientX - centre[0]) > 4 || Math.abs(e.clientY - centre[1]) > 4) return;
        centre = null;
        return;
      }
      this.yaw -= e.movementX * 0.15;
      this.pitch = Math.max(-89, Math.min(89, this.pitch - e.movementY * 0.15));
      if (native) {
        const m = 48;
        if (e.clientX < m || e.clientY < m || e.clientX > window.innerWidth - m || e.clientY > window.innerHeight - m) {
          centre = [Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2)];
          void invoke("cursor_warp", { x: centre[0], y: centre[1] }).catch(() => {
            centre = null;
          });
        }
      }
    });
    window.addEventListener("blur", () => {
      this.looking = false;
      release();
    });
    document.addEventListener("pointerlockchange", () => {
      // Lock gone while the button is still down (Esc, or the system took it
      // back): keep turning without it. Lock arrived after the button went up: let go.
      if (document.pointerLockElement === canvas && !this.looking) release();
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (this.wheelHook?.(e)) {
          e.preventDefault();
          return;
        }
        this.speed = Math.max(25, Math.min(8000, this.speed * (e.deltaY < 0 ? 1.25 : 0.8)));
        this.onSpeed?.(this.speed);
        e.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  forward() {
    const cy = Math.cos(this.yaw * DEG);
    const sy = Math.sin(this.yaw * DEG);
    const cp = Math.cos(this.pitch * DEG);
    const sp = Math.sin(this.pitch * DEG);
    return vec3.create(cy * cp, sy * cp, sp);
  }

  right() {
    const cy = Math.cos(this.yaw * DEG);
    const sy = Math.sin(this.yaw * DEG);
    return vec3.create(sy, -cy, 0);
  }

  update(dt: number) {
    let mul = 1;
    if (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) mul = 4;
    if (this.keys.has("ControlLeft") || this.keys.has("ControlRight")) mul = 0.25;
    const step = this.speed * mul * dt;
    if (this.flyOnlyWhileLooking && !this.looking) return;
    const f = this.forward();
    const r = this.right();
    const move = vec3.create(0, 0, 0);
    if (this.keys.has("KeyW")) vec3.add(move, f, move);
    if (this.keys.has("KeyS")) vec3.sub(move, f, move);
    if (this.keys.has("KeyD")) vec3.add(move, r, move);
    if (this.keys.has("KeyA")) vec3.sub(move, r, move);
    if (this.keys.has("Space") || this.keys.has("KeyE")) move[2] += 1;
    if (this.keys.has("KeyC") || this.keys.has("KeyQ")) move[2] -= 1;
    if (vec3.length(move) > 0) {
      vec3.normalize(move, move);
      vec3.addScaled(this.position, move, step, this.position);
    }
  }

  /** Places the camera so the whole box is in view, looking at its centre. */
  frame(lo: [number, number, number], hi: [number, number, number]) {
    const center = vec3.create((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
    const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 64);
    const dist = size * 0.9;
    this.position = vec3.create(center[0] - dist * 0.6, center[1] - dist * 0.8, center[2] + dist * 0.5);
    const d = vec3.sub(center, this.position);
    this.yaw = Math.atan2(d[1], d[0]) / DEG;
    this.pitch = Math.atan2(d[2], Math.hypot(d[0], d[1])) / DEG;
    this.speed = Math.max(100, Math.min(4000, size / 4));
  }

  viewProjection(aspect: number): Mat4 {
    const proj = mat4.perspective(this.fovDeg * DEG, aspect, this.near, this.far);
    const target = vec3.add(this.position, this.forward());
    const view = mat4.lookAt(this.position, target, vec3.create(0, 0, 1));
    return mat4.multiply(proj, view);
  }
}

/** Draw distances offered in settings (Hammer's 3D view far clip): the last is the whole map. */
export const FAR_CHOICES = [2048, 4096, 8192, 16384, 32768, 65536];
/** Field-of-view choices, degrees (Unity and Unreal let you set it too). */
export const FOV_CHOICES = [60, 75, 90, 100];

/** The 3D view's far clip and field of view from stored text, falling back to 65536 and 75 when missing or out of range. */
export function parseViewSettings(far: string | null, fov: string | null): { far: number; fov: number } {
  const f = Number(far);
  const v = Number(fov);
  return { far: f >= 512 && f <= 65536 ? f : 65536, fov: v >= 30 && v <= 120 ? v : 75 };
}

/** The 3D view settings kept by the settings panel ("gme.farClip", "gme.fov"). */
export function readViewSettings(): { far: number; fov: number } {
  try {
    return parseViewSettings(localStorage.getItem("gme.farClip"), localStorage.getItem("gme.fov"));
  } catch {
    return parseViewSettings(null, null);
  }
}

/** The flight setting kept by the settings panel ("gme.flyHold"). */
export function readFlyHold(): boolean {
  try {
    return localStorage.getItem("gme.flyHold") === "1";
  } catch {
    return false;
  }
}
