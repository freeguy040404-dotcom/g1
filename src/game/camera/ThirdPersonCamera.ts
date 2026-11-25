import * as THREE from 'three';

const MIN_DISTANCE = 3.2;
const MAX_DISTANCE = 11.5;
const MIN_PITCH = -0.35; // allow looking slightly upward from low angle
const MAX_PITCH = 1.18;  // overhead limit (~68 deg)
const COLLISION_PADDING = 0.36;
const MIN_CAMERA_Y = 0.42;

// Reusable scratch objects (zero GC per frame)
const _desiredPos = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _rightVec = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);
const _camUp = new THREE.Vector3();
const _whiskerOrigin = new THREE.Vector3();
const _hits: THREE.Intersection[] = [];

const WHISKER_OFFSETS: [number, number][] = [
  [0, 0],
  [0.24, 0],
  [-0.24, 0],
  [0, 0.2],
  [0, -0.18],
];

export class ThirdPersonCamera {
  public readonly camera: THREE.PerspectiveCamera;

  private readonly domElement: HTMLElement;
  private colliders: THREE.Object3D[];
  private readonly raycaster = new THREE.Raycaster();
  private readonly onPointerLockChange: (locked: boolean) => void;
  private readonly onUserInteract: () => void;

  private targetYaw = 0.35;
  private targetPitch = 0.34;
  private targetDistance = 6.2;

  private currentYaw = 0.35;
  private currentPitch = 0.34;
  private currentDistance = 6.2;
  private minCameraY = MIN_CAMERA_Y;

  private readonly smoothedPivot = new THREE.Vector3(0, 2.2, 0.4);
  private pivotInitialized = false;

  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerLocked = false;
  private sensitivityMultiplier = 1.0;
  private invertY = false;
  private shakeTrauma = 0;
  private shakePhase = 0;

  constructor(
    aspect: number,
    domElement: HTMLElement,
    colliders: THREE.Object3D[],
    onPointerLockChange: (locked: boolean) => void,
    onUserInteract: () => void,
  ) {
    this.camera = new THREE.PerspectiveCamera(52, aspect, 0.15, 420);
    this.domElement = domElement;
    this.colliders = colliders;
    this.onPointerLockChange = onPointerLockChange;
    this.onUserInteract = onUserInteract;

    this.bindEvents();
  }

  private readonly handlePointerDown = (e: PointerEvent): void => {
    this.onUserInteract();
    if (this.pointerLocked) return;
    // Middle-mouse drag or Alt+drag orbits the camera while LMB/RMB aim left/right hands
    const isOrbitDrag = e.button === 1 || (e.altKey && (e.button === 0 || e.button === 2));
    if (!isOrbitDrag) return;
    e.preventDefault();
    this.isDragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.domElement.setPointerCapture?.(e.pointerId);
  };

  private readonly handlePointerMove = (e: PointerEvent): void => {
    if (this.pointerLocked) return;
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.applyRotationDelta(dx, dy, 0.0052);
  };

  private readonly handlePointerUp = (e: PointerEvent): void => {
    this.isDragging = false;
    if (this.domElement.hasPointerCapture?.(e.pointerId)) {
      this.domElement.releasePointerCapture(e.pointerId);
    }
  };

  private readonly handleMouseMoveLocked = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.applyRotationDelta(e.movementX, e.movementY, 0.0028);
  };

  private readonly handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance + e.deltaY * 0.0045,
      MIN_DISTANCE,
      MAX_DISTANCE,
    );
  };

  private readonly handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private readonly handlePointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.domElement;
    this.pointerLocked = locked;
    if (locked) {
      this.isDragging = false;
    }
    this.onPointerLockChange(locked);
  };

  private readonly handlePointerLockError = (): void => {
    this.pointerLocked = false;
    this.onPointerLockChange(false);
  };

  private applyRotationDelta(dx: number, dy: number, sensitivity: number): void {
    const scaled = sensitivity * this.sensitivityMultiplier;
    const ySign = this.invertY ? -1 : 1;
    this.targetYaw -= dx * scaled;
    this.targetPitch = THREE.MathUtils.clamp(
      this.targetPitch + dy * scaled * ySign,
      MIN_PITCH,
      MAX_PITCH,
    );
  }

  private bindEvents(): void {
    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    document.addEventListener('mousemove', this.handleMouseMoveLocked);
    this.domElement.addEventListener('wheel', this.handleWheel, { passive: false });
    this.domElement.addEventListener('contextmenu', this.handleContextMenu);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);
  }

  public togglePointerLock(): void {
    this.onUserInteract();
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock?.();
    } else if (this.domElement.requestPointerLock) {
      try {
        const res = this.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {
            this.onPointerLockChange(false);
          });
        }
      } catch {
        this.onPointerLockChange(false);
      }
    }
  }

  public exitPointerLock(): void {
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock?.();
    }
  }

  public setColliders(colliders: THREE.Object3D[]): void {
    this.colliders = colliders;
  }

  public setMinCameraY(y: number): void {
    this.minCameraY = y;
  }

  public resetView(
    followTarget: THREE.Vector3,
    yaw = 0.35,
    pitch = 0.34,
    distance = 6.6,
  ): void {
    this.targetYaw = yaw;
    this.currentYaw = yaw;
    this.targetPitch = pitch;
    this.currentPitch = pitch;
    this.targetDistance = distance;
    this.currentDistance = distance;
    this.smoothedPivot.copy(followTarget);
    this.pivotInitialized = true;
    this.shakeTrauma = 0;
    this.update(followTarget, 0.016, 0);
  }

  public addImpactShake(intensity: number): void {
    const clamped = THREE.MathUtils.clamp(intensity, 0, 1);
    this.shakeTrauma = Math.min(1, Math.max(this.shakeTrauma, clamped));
  }

  public applySettings(options: {
    sensitivity: number;
    invertY: boolean;
    distance: number;
  }): void {
    this.sensitivityMultiplier = THREE.MathUtils.clamp(options.sensitivity, 0.4, 2.2);
    this.invertY = options.invertY;
    this.targetDistance = THREE.MathUtils.clamp(options.distance, MIN_DISTANCE, MAX_DISTANCE);
  }

  /**
   * Smooth cinematic orbital framing for the 3D Main Menu screen so the left menu rail stays clean
   * while the wobbly character performs funny physics movements on the right side of the viewport.
   */
  public updateMenuOrbit(
    focusPos: THREE.Vector3,
    dt: number,
    elapsedSeconds: number,
  ): void {
    const safeDt = Math.min(dt, 0.05);
    const orbitYaw = 0.55 + Math.sin(elapsedSeconds * 0.22) * 0.48;
    const orbitPitch = 0.24 + Math.sin(elapsedSeconds * 0.31) * 0.06;
    const orbitDist = 6.9 + Math.cos(elapsedSeconds * 0.19) * 0.55;

    // Offset look target slightly to the left of the character so character sits beautifully right-of-center
    _rayOrigin.set(focusPos.x - 1.35, focusPos.y + 0.55, focusPos.z);
    if (!this.pivotInitialized) {
      this.smoothedPivot.copy(_rayOrigin);
      this.pivotInitialized = true;
    } else {
      this.smoothedPivot.x = THREE.MathUtils.damp(this.smoothedPivot.x, _rayOrigin.x, 4.5, safeDt);
      this.smoothedPivot.y = THREE.MathUtils.damp(this.smoothedPivot.y, _rayOrigin.y, 4.5, safeDt);
      this.smoothedPivot.z = THREE.MathUtils.damp(this.smoothedPivot.z, _rayOrigin.z, 4.5, safeDt);
    }

    const cosP = Math.cos(orbitPitch);
    _desiredPos.set(
      this.smoothedPivot.x + Math.sin(orbitYaw) * cosP * orbitDist,
      Math.max(this.minCameraY + 1.2, this.smoothedPivot.y + Math.sin(orbitPitch) * orbitDist),
      this.smoothedPivot.z + Math.cos(orbitYaw) * cosP * orbitDist,
    );

    this.camera.position.lerp(_desiredPos, 1 - Math.exp(-4.2 * safeDt));
    this.camera.lookAt(this.smoothedPivot);
  }

  public isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  public getForwardXZ(out: THREE.Vector3): THREE.Vector3 {
    // Camera looks from (+sin(yaw), +cos(yaw)) toward pivot -> forward is (-sin(yaw), 0, -cos(yaw))
    return out.set(-Math.sin(this.currentYaw), 0, -Math.cos(this.currentYaw)).normalize();
  }

  public getRightXZ(out: THREE.Vector3): THREE.Vector3 {
    // Cross(forward, worldUp) -> (+cos(yaw), 0, -sin(yaw))
    return out.set(Math.cos(this.currentYaw), 0, -Math.sin(this.currentYaw)).normalize();
  }

  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  public update(followTarget: THREE.Vector3, dt: number, runRatio = 0): void {
    const safeDt = Math.min(dt, 0.05);

    if (!this.pivotInitialized) {
      this.smoothedPivot.copy(followTarget);
      this.pivotInitialized = true;
    } else {
      // Track horizontal movement smoothly and damp vertical motion slightly softer
      // during jumps so the character stays comfortably framed without sudden camera jerks.
      const verticalLambda = followTarget.y > this.smoothedPivot.y ? 7.5 : 10.5;
      this.smoothedPivot.x = THREE.MathUtils.damp(this.smoothedPivot.x, followTarget.x, 11, safeDt);
      this.smoothedPivot.y = THREE.MathUtils.damp(
        this.smoothedPivot.y,
        followTarget.y,
        verticalLambda,
        safeDt,
      );
      this.smoothedPivot.z = THREE.MathUtils.damp(this.smoothedPivot.z, followTarget.z, 11, safeDt);
    }

    // Smooth orbit inertia
    this.currentYaw = THREE.MathUtils.damp(this.currentYaw, this.targetYaw, 18, safeDt);
    this.currentPitch = THREE.MathUtils.damp(this.currentPitch, this.targetPitch, 18, safeDt);

    // Spherical offset from pivot to desired camera position
    const cosPitch = Math.cos(this.currentPitch);
    const sinPitch = Math.sin(this.currentPitch);
    const sinYaw = Math.sin(this.currentYaw);
    const cosYaw = Math.cos(this.currentYaw);

    _rayDir.set(sinYaw * cosPitch, sinPitch, cosYaw * cosPitch).normalize();

    // Subtle distance expansion while sprinting for wider situational visibility
    const desiredOrbitDistance = THREE.MathUtils.clamp(
      this.targetDistance + THREE.MathUtils.clamp(runRatio, 0, 1) * 0.65,
      MIN_DISTANCE,
      MAX_DISTANCE + 0.65,
    );

    // Multi-ray whisker collision check from player shoulder pivot toward desired camera position
    // Prevents camera from penetrating walls, pillars, arches, observatory dome, or ground
    _rightVec.crossVectors(_upVec, _rayDir).normalize();
    if (_rightVec.lengthSq() < 0.001) {
      _rightVec.set(1, 0, 0);
    }
    _camUp.crossVectors(_rayDir, _rightVec).normalize();

    let safeDistance = desiredOrbitDistance;
    this.raycaster.near = 0.08;
    this.raycaster.far = desiredOrbitDistance + COLLISION_PADDING;

    for (const [rx, ry] of WHISKER_OFFSETS) {
      _whiskerOrigin
        .copy(this.smoothedPivot)
        .addScaledVector(_rightVec, rx)
        .addScaledVector(_camUp, ry);

      this.raycaster.set(_whiskerOrigin, _rayDir);
      _hits.length = 0;
      this.raycaster.intersectObjects(this.colliders, false, _hits);
      if (_hits.length > 0) {
        const hitDist = Math.max(0.85, _hits[0].distance - COLLISION_PADDING);
        if (hitDist < safeDistance) {
          safeDistance = hitDist;
        }
      }
    }

    // Fast pull-in when obstructed, gentle ease-out when clear
    const distanceLambda = safeDistance < this.currentDistance ? 24 : 7;
    this.currentDistance = THREE.MathUtils.damp(
      this.currentDistance,
      safeDistance,
      distanceLambda,
      safeDt,
    );

    _desiredPos.copy(this.smoothedPivot).addScaledVector(_rayDir, this.currentDistance);

    // Prevent camera from dipping below the level's lower camera floor
    if (_desiredPos.y < this.minCameraY) {
      _desiredPos.y = this.minCameraY;
    }

    this.camera.position.copy(_desiredPos);
    _rayOrigin.copy(this.smoothedPivot);

    // Subtle damped impact micro-shake on heavy landings & big object impacts (zero nausea)
    if (this.shakeTrauma > 0.004) {
      this.shakePhase += safeDt * 42;
      const sq = this.shakeTrauma * this.shakeTrauma;
      const amp = sq * 0.14;
      const ox = Math.sin(this.shakePhase * 1.13) * amp;
      const oy = Math.cos(this.shakePhase * 1.47) * amp * 1.25;
      this.camera.position.addScaledVector(_rightVec, ox);
      this.camera.position.y += oy;
      _rayOrigin.y += oy * 0.45;
      this.shakeTrauma = Math.max(0, this.shakeTrauma - safeDt * 2.6);
    }

    this.camera.lookAt(_rayOrigin);
  }

  public dispose(): void {
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    document.removeEventListener('mousemove', this.handleMouseMoveLocked);
    this.domElement.removeEventListener('wheel', this.handleWheel);
    this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock?.();
    }
  }
}
