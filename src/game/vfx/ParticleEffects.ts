import * as THREE from 'three';
import type { ImpactEffectKind, LevelId } from '../types';

const BURST_POOL_SIZE = 96;
const AMBIENT_MOTE_COUNT = 110;
const AMBIENT_SPAN_XZ = 26;
const AMBIENT_SPAN_Y = 12;

interface BurstParticle {
  active: boolean;
  age: number;
  maxAge: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  baseScale: number;
  rotX: number;
  rotY: number;
  spin: number;
}

interface AmbientThemeConfig {
  colorHex: number;
  size: number;
  opacity: number;
  driftX: number;
  driftY: number;
  driftZ: number;
  swirlAmp: number;
}

const AMBIENT_THEMES: Record<LevelId, AmbientThemeConfig> = {
  'dream-world': {
    colorHex: 0xfff7dc,
    size: 0.14,
    opacity: 0.72,
    driftX: 0.35,
    driftY: 0.22,
    driftZ: 0.18,
    swirlAmp: 0.45,
  },
  warehouse: {
    colorHex: 0xe6decb,
    size: 0.11,
    opacity: 0.42,
    driftX: 0.12,
    driftY: -0.06,
    driftZ: 0.08,
    swirlAmp: 0.18,
  },
  'mountain-adventure': {
    colorHex: 0xf4f9ff,
    size: 0.16,
    opacity: 0.78,
    driftX: 1.45,
    driftY: -0.95,
    driftZ: 0.65,
    swirlAmp: 0.55,
  },
  'construction-site': {
    colorHex: 0xf2d9b1,
    size: 0.12,
    opacity: 0.48,
    driftX: 0.72,
    driftY: -0.14,
    driftZ: 0.3,
    swirlAmp: 0.3,
  },
  'medieval-castle': {
    colorHex: 0xffd79a,
    size: 0.13,
    opacity: 0.62,
    driftX: 0.22,
    driftY: 0.32,
    driftZ: -0.18,
    swirlAmp: 0.4,
  },
  observatory: {
    colorHex: 0xfff8e6,
    size: 0.13,
    opacity: 0.65,
    driftX: 0.28,
    driftY: 0.14,
    driftZ: 0.16,
    swirlAmp: 0.35,
  },
};

const _dummy = new THREE.Object3D();
const _tintColor = new THREE.Color();

export class ParticleEffects {
  private readonly burstMesh: THREE.InstancedMesh;
  private readonly burstGeo: THREE.BufferGeometry;
  private readonly burstMat: THREE.MeshStandardMaterial;
  private readonly burstPool: BurstParticle[] = [];
  private nextBurstCursor = 0;

  private readonly ambientPoints: THREE.Points;
  private readonly ambientGeo: THREE.BufferGeometry;
  private readonly ambientMat: THREE.PointsMaterial;
  private readonly ambientPositions: Float32Array;
  private readonly ambientPhases: Float32Array;
  private activeTheme: AmbientThemeConfig = AMBIENT_THEMES['dream-world'];
  private ambientInitialized = false;

  constructor(scene: THREE.Scene) {
    // 1. Pooled instanced burst particles (dust puffs, wood chips, metal sparks, stone dust)
    this.burstGeo = new THREE.DodecahedronGeometry(0.11, 0);
    this.burstMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.08,
      flatShading: true,
    });
    this.burstMesh = new THREE.InstancedMesh(this.burstGeo, this.burstMat, BURST_POOL_SIZE);
    this.burstMesh.frustumCulled = false;
    this.burstMesh.castShadow = false;
    this.burstMesh.receiveShadow = false;

    _dummy.position.set(0, -500, 0);
    _dummy.scale.setScalar(0.0001);
    _dummy.updateMatrix();
    _tintColor.setHex(0xffffff);

    for (let i = 0; i < BURST_POOL_SIZE; i++) {
      this.burstPool.push({
        active: false,
        age: 0,
        maxAge: 0.5,
        px: 0,
        py: -500,
        pz: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: -4,
        baseScale: 1,
        rotX: 0,
        rotY: 0,
        spin: 2,
      });
      this.burstMesh.setMatrixAt(i, _dummy.matrix);
      this.burstMesh.setColorAt(i, _tintColor);
    }
    this.burstMesh.instanceMatrix.needsUpdate = true;
    if (this.burstMesh.instanceColor) this.burstMesh.instanceColor.needsUpdate = true;
    scene.add(this.burstMesh);

    // 2. Subtle biome environmental particles (pre-allocated buffer, zero GC)
    this.ambientGeo = new THREE.BufferGeometry();
    this.ambientPositions = new Float32Array(AMBIENT_MOTE_COUNT * 3);
    this.ambientPhases = new Float32Array(AMBIENT_MOTE_COUNT);
    for (let i = 0; i < AMBIENT_MOTE_COUNT; i++) {
      this.ambientPhases[i] = Math.random() * Math.PI * 2;
    }
    this.ambientGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.ambientPositions, 3),
    );
    this.ambientMat = new THREE.PointsMaterial({
      color: this.activeTheme.colorHex,
      size: this.activeTheme.size,
      transparent: true,
      opacity: this.activeTheme.opacity,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.ambientPoints = new THREE.Points(this.ambientGeo, this.ambientMat);
    this.ambientPoints.frustumCulled = false;
    scene.add(this.ambientPoints);
  }

  public setLevelTheme(levelId: LevelId, focusPos?: THREE.Vector3): void {
    const cfg = AMBIENT_THEMES[levelId] ?? AMBIENT_THEMES['dream-world'];
    this.activeTheme = cfg;
    this.ambientMat.color.setHex(cfg.colorHex);
    this.ambientMat.size = cfg.size;
    this.ambientMat.opacity = cfg.opacity;
    if (focusPos) {
      this.seedAmbientAround(focusPos);
    }
  }

  private seedAmbientAround(center: THREE.Vector3): void {
    for (let i = 0; i < AMBIENT_MOTE_COUNT; i++) {
      const idx = i * 3;
      this.ambientPositions[idx] = center.x + (Math.random() - 0.5) * AMBIENT_SPAN_XZ;
      this.ambientPositions[idx + 1] = center.y + (Math.random() - 0.35) * AMBIENT_SPAN_Y;
      this.ambientPositions[idx + 2] = center.z + (Math.random() - 0.5) * AMBIENT_SPAN_XZ;
    }
    (this.ambientGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.ambientInitialized = true;
  }

  public emitImpact(
    x: number,
    y: number,
    z: number,
    intensity: number,
    kind: ImpactEffectKind,
  ): void {
    const clamped = THREE.MathUtils.clamp(intensity, 0.2, 1.5);
    const count = Math.min(14, Math.max(4, Math.round(4 + clamped * 6)));

    let colorHex = 0xe9e1d2;
    let gravity = -3.6;
    let baseScale = 0.85;
    let upSpeed = 1.65;
    let radialSpeed = 2.1;

    if (kind === 'metal' || kind === 'spark') {
      colorHex = 0xffcf70;
      gravity = -9.5;
      baseScale = 0.48;
      upSpeed = 2.8;
      radialSpeed = 3.2;
    } else if (kind === 'wood') {
      colorHex = 0xd9b382;
      gravity = -6.8;
      baseScale = 0.65;
      upSpeed = 2.0;
      radialSpeed = 2.4;
    } else if (kind === 'stone') {
      colorHex = 0xc5bfb4;
      gravity = -5.4;
      baseScale = 0.95;
      upSpeed = 1.8;
      radialSpeed = 2.3;
    } else {
      // Soft landing/ground dust puff
      colorHex = 0xeee8dc;
      gravity = -1.6;
      baseScale = 1.05;
      upSpeed = 1.15;
      radialSpeed = 1.95;
    }

    _tintColor.setHex(colorHex);
    for (let i = 0; i < count; i++) {
      const slotIndex = this.nextBurstCursor;
      this.nextBurstCursor = (this.nextBurstCursor + 1) % BURST_POOL_SIZE;
      const p = this.burstPool[slotIndex];

      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const spd = radialSpeed * (0.45 + Math.random() * 0.75) * clamped;

      p.active = true;
      p.age = 0;
      p.maxAge = 0.34 + Math.random() * 0.36;
      p.px = x + Math.cos(angle) * 0.14;
      p.py = y + 0.04 + Math.random() * 0.12;
      p.pz = z + Math.sin(angle) * 0.14;
      p.vx = Math.cos(angle) * spd;
      p.vy = upSpeed * (0.45 + Math.random() * 0.75) * clamped;
      p.vz = Math.sin(angle) * spd;
      p.gravity = gravity;
      p.baseScale = baseScale * (0.7 + Math.random() * 0.6) * Math.min(1.3, 0.7 + clamped * 0.45);
      p.rotX = Math.random() * Math.PI;
      p.rotY = Math.random() * Math.PI;
      p.spin = (Math.random() - 0.5) * 7.5;

      this.burstMesh.setColorAt(slotIndex, _tintColor);
    }

    if (this.burstMesh.instanceColor) {
      this.burstMesh.instanceColor.needsUpdate = true;
    }
  }

  public update(dt: number, elapsedSeconds: number, playerPos: THREE.Vector3): void {
    const safeDt = Math.min(dt, 0.05);

    // 1. Advance pooled burst particles
    let burstDirty = false;
    for (let i = 0; i < BURST_POOL_SIZE; i++) {
      const p = this.burstPool[i];
      if (!p.active) continue;
      burstDirty = true;
      p.age += safeDt;
      if (p.age >= p.maxAge) {
        p.active = false;
        _dummy.position.set(0, -500, 0);
        _dummy.scale.setScalar(0.0001);
        _dummy.updateMatrix();
        this.burstMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      p.vy += p.gravity * safeDt;
      const drag = Math.max(0, 1 - 2.4 * safeDt);
      p.vx *= drag;
      p.vz *= drag;
      p.px += p.vx * safeDt;
      p.py += p.vy * safeDt;
      p.pz += p.vz * safeDt;
      p.rotX += p.spin * safeDt;
      p.rotY += p.spin * 0.7 * safeDt;

      const t = p.age / p.maxAge;
      // Quick pop-in then smooth shrink-out
      const scaleCurve = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      const s = Math.max(0.001, p.baseScale * scaleCurve);

      _dummy.position.set(p.px, p.py, p.pz);
      _dummy.rotation.set(p.rotX, p.rotY, 0);
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      this.burstMesh.setMatrixAt(i, _dummy.matrix);
    }
    if (burstDirty) {
      this.burstMesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Advance subtle biome ambient motes wrapped around player
    if (!this.ambientInitialized) {
      this.seedAmbientAround(playerPos);
    }
    const cfg = this.activeTheme;
    const halfXZ = AMBIENT_SPAN_XZ * 0.5;
    const halfY = AMBIENT_SPAN_Y * 0.5;

    for (let i = 0; i < AMBIENT_MOTE_COUNT; i++) {
      const idx = i * 3;
      const phase = this.ambientPhases[i];
      let x =
        this.ambientPositions[idx] +
        (cfg.driftX + Math.sin(elapsedSeconds * 0.8 + phase) * cfg.swirlAmp) * safeDt;
      let y =
        this.ambientPositions[idx + 1] +
        (cfg.driftY + Math.cos(elapsedSeconds * 0.65 + phase * 1.3) * (cfg.swirlAmp * 0.45)) *
          safeDt;
      let z =
        this.ambientPositions[idx + 2] +
        (cfg.driftZ + Math.cos(elapsedSeconds * 0.72 + phase) * cfg.swirlAmp) * safeDt;

      // Wrap seamlessly into the bounding box around the player
      if (x - playerPos.x > halfXZ) x -= AMBIENT_SPAN_XZ;
      else if (x - playerPos.x < -halfXZ) x += AMBIENT_SPAN_XZ;

      if (z - playerPos.z > halfXZ) z -= AMBIENT_SPAN_XZ;
      else if (z - playerPos.z < -halfXZ) z += AMBIENT_SPAN_XZ;

      if (y - playerPos.y > halfY + 2) y -= AMBIENT_SPAN_Y;
      else if (y - playerPos.y < -halfY + 2) y += AMBIENT_SPAN_Y;

      this.ambientPositions[idx] = x;
      this.ambientPositions[idx + 1] = y;
      this.ambientPositions[idx + 2] = z;
    }
    (this.ambientGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  public dispose(): void {
    this.burstGeo.dispose();
    this.burstMat.dispose();
    this.ambientGeo.dispose();
    this.ambientMat.dispose();
  }
}
