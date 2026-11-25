import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  buildHumanoidVisualRig,
  CHARACTER_BODY_HALF_HEIGHT,
  type HumanoidVisualRig,
} from '../character/CharacterRig';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ProceduralTextureSet } from '../textures';
import type { CharacterSyncPayload, NetworkPlayerInfo, SyncedHandState } from './protocol';

const BASE_INTERPOLATION_DELAY_MS = 80;
const MAX_INTERPOLATION_DELAY_MS = 220;
const MAX_EXTRAPOLATION_MS = 120;
const MAX_BUFFER_SIZE = 16;
const TELEPORT_SNAP_DISTANCE_SQ = 36; // 6m threshold for instant respawn snap

// Pre-allocated scratch math helpers (zero GC per frame)
const _posA = new THREE.Vector3();
const _posB = new THREE.Vector3();
const _interpPos = new THREE.Vector3();
const _velVec = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();
const _interpQuat = new THREE.Quaternion();
const _armQuatA = new THREE.Quaternion();
const _armQuatB = new THREE.Quaternion();
const _armQuatOut = new THREE.Quaternion();
const _handTipWorld = new THREE.Vector3();
const _targetPointA = new THREE.Vector3();
const _targetPointB = new THREE.Vector3();
const _targetPointOut = new THREE.Vector3();

interface HandInteractionVisual {
  markerMesh: THREE.Mesh;
  markerMat: THREE.MeshBasicMaterial;
  tetherLine: THREE.Line;
  tetherPositions: Float32Array;
  tetherMat: THREE.LineBasicMaterial;
}

function createNameplateTexture(
  displayName: string,
  colorHex: string,
  isHost: boolean,
  statusTag: string | null,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const labelText = displayName.slice(0, 20);
    const badgeText = isHost ? 'HOST' : statusTag;

    ctx.font = '700 32px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const nameWidth = ctx.measureText(labelText).width;
    ctx.font = '700 20px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const badgeWidth = badgeText ? ctx.measureText(badgeText).width + 26 : 0;

    const totalContentWidth = 24 + 14 + nameWidth + (badgeWidth > 0 ? 14 + badgeWidth : 0);
    const pillWidth = Math.min(488, Math.max(150, totalContentWidth + 40));
    const pillHeight = 64;
    const x = (canvas.width - pillWidth) * 0.5;
    const y = (canvas.height - pillHeight) * 0.5;
    const radius = 16;

    // Crisp semi-opaque light card matching Wobblepeak UI
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.beginPath();
    ctx.roundRect(x, y, pillWidth, pillHeight, radius);
    ctx.fill();

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
    ctx.lineWidth = 3;
    ctx.stroke();

    let cursorX = x + 22;
    const centerY = y + pillHeight * 0.5;

    // Distinct player color dot
    ctx.fillStyle = colorHex;
    ctx.beginPath();
    ctx.arc(cursorX + 9, centerY, 10, 0, Math.PI * 2);
    ctx.fill();
    cursorX += 32;

    // Player display name (Canvas fillText is strictly non-HTML)
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 30px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, cursorX, centerY + 1, pillWidth - (cursorX - x) - badgeWidth - 26);
    cursorX += Math.min(nameWidth, pillWidth - (cursorX - x) - badgeWidth - 26) + 14;

    // Optional HOST or live interaction badge
    if (badgeText) {
      const bx = x + pillWidth - badgeWidth - 16;
      const by = centerY - 16;
      ctx.fillStyle = isHost ? '#1d4ed8' : '#0f172a';
      ctx.beginPath();
      ctx.roundRect(bx, by, badgeWidth, 32, 8);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, bx + badgeWidth * 0.5, centerY + 1);
      ctx.textAlign = 'left';
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class RemotePlayerAvatar {
  public readonly playerId: string;
  public readonly root = new THREE.Group();

  private readonly scene: THREE.Scene;
  private readonly physics: PhysicsWorld | null;
  private readonly boostCollider: CANNON.Body | null;
  private readonly rig: HumanoidVisualRig;
  private readonly contactShadowMesh: THREE.Mesh;
  private readonly nameplateSprite: THREE.Sprite;
  private nameplateMaterial: THREE.SpriteMaterial;
  private nameplateTexture: THREE.CanvasTexture;
  private readonly leftInteractionVis: HandInteractionVisual;
  private readonly rightInteractionVis: HandInteractionVisual;
  private readonly extraDisposables: Array<{ dispose: () => void }> = [];

  private playerInfo: NetworkPlayerInfo;
  private currentNameplateStatus: string | null = null;

  // Ordered snapshot ring buffer (oldest -> newest by serverTime)
  private readonly snapshots: CharacterSyncPayload[] = [];
  private lastAcceptedSeq = -1;
  private lastLeftReleaseSeq = 0;
  private lastRightReleaseSeq = 0;
  private releaseRecoilLeft = 0;
  private releaseRecoilRight = 0;

  // Smoothed state for zero-jitter rendering & leg/squash interpolation
  private readonly currentPos = new THREE.Vector3();
  private readonly currentQuat = new THREE.Quaternion();
  private currentGroundY = 0;
  private currentSquash = 0;
  private currentRagdoll = 0;
  private currentStridePhase = 0;
  private currentMoveIntensity = 0;
  private currentHangBlend = 0;
  private shimmyPhase = 0;
  private hasReceivedSnapshot = false;

  constructor(
    scene: THREE.Scene,
    textures: ProceduralTextureSet,
    playerInfo: NetworkPlayerInfo,
    initialSpawnPos: [number, number, number],
    initialSpawnYaw: number,
    physics: PhysicsWorld | null = null,
  ) {
    this.scene = scene;
    this.physics = physics;
    this.playerId = playerInfo.id;
    this.playerInfo = { ...playerInfo };

    // 1. Reuse the exact same composite humanoid model as the local character
    this.rig = buildHumanoidVisualRig(playerInfo.color);
    this.root.add(this.rig.bodyVisual);
    this.currentPos.set(initialSpawnPos[0], initialSpawnPos[1], initialSpawnPos[2]);
    this.currentQuat.setFromEuler(new THREE.Euler(0, initialSpawnYaw, 0));
    this.currentGroundY = initialSpawnPos[1] - CHARACTER_BODY_HALF_HEIGHT;
    this.root.position.copy(this.currentPos);
    this.root.quaternion.copy(this.currentQuat);
    this.scene.add(this.root);

    // 1b. Cooperative climbing shoulder-boost kinematic collider so teammates can boost each other
    if (this.physics) {
      this.boostCollider = new CANNON.Body({
        type: CANNON.Body.KINEMATIC,
        material: this.physics.stoneMaterial,
        shape: new CANNON.Box(new CANNON.Vec3(0.36, 0.72, 0.36)),
        position: new CANNON.Vec3(initialSpawnPos[0], initialSpawnPos[1], initialSpawnPos[2]),
      });
      this.physics.world.addBody(this.boostCollider);
    } else {
      this.boostCollider = null;
    }

    // 2. Soft grounded contact shadow beneath remote player
    const shadowGeo = new THREE.PlaneGeometry(1.55, 1.55);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.44,
    });
    this.contactShadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.contactShadowMesh.position.set(
      initialSpawnPos[0],
      this.currentGroundY + 0.03,
      initialSpawnPos[2],
    );
    this.scene.add(this.contactShadowMesh);
    this.extraDisposables.push(shadowGeo, shadowMat);

    // 3. World-space player nameplate sprite above the beanie
    this.nameplateTexture = createNameplateTexture(
      playerInfo.displayName,
      playerInfo.color,
      playerInfo.isHost,
      null,
    );
    this.nameplateMaterial = new THREE.SpriteMaterial({
      map: this.nameplateTexture,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.nameplateSprite = new THREE.Sprite(this.nameplateMaterial);
    this.nameplateSprite.scale.set(1.75, 0.44, 1);
    this.nameplateSprite.position.set(
      initialSpawnPos[0],
      initialSpawnPos[1] + 1.48,
      initialSpawnPos[2],
    );
    this.nameplateSprite.renderOrder = 8;
    this.scene.add(this.nameplateSprite);

    // 4. Remote hand interaction indicators (target ring + subtle tether when grabbing blocks/ledges)
    this.leftInteractionVis = this.buildHandInteractionVisual(0x2563eb);
    this.rightInteractionVis = this.buildHandInteractionVisual(0xea580c);
  }

  private buildHandInteractionVisual(accentHex: number): HandInteractionVisual {
    const markerGeo = new THREE.SphereGeometry(0.065, 12, 10);
    const markerMat = new THREE.MeshBasicMaterial({
      color: accentHex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const markerMesh = new THREE.Mesh(markerGeo, markerMat);
    markerMesh.visible = false;
    markerMesh.renderOrder = 6;
    this.scene.add(markerMesh);

    const tetherPositions = new Float32Array(6);
    const tetherGeo = new THREE.BufferGeometry();
    tetherGeo.setAttribute('position', new THREE.BufferAttribute(tetherPositions, 3));
    const tetherMat = new THREE.LineBasicMaterial({
      color: accentHex,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });
    const tetherLine = new THREE.Line(tetherGeo, tetherMat);
    tetherLine.visible = false;
    tetherLine.frustumCulled = false;
    tetherLine.renderOrder = 5;
    this.scene.add(tetherLine);

    this.extraDisposables.push(markerGeo, markerMat, tetherGeo, tetherMat);
    return { markerMesh, markerMat, tetherLine, tetherPositions, tetherMat };
  }

  public updatePlayerInfo(nextInfo: NetworkPlayerInfo): void {
    const visualChanged =
      nextInfo.displayName !== this.playerInfo.displayName ||
      nextInfo.color !== this.playerInfo.color ||
      nextInfo.isHost !== this.playerInfo.isHost;

    this.playerInfo = { ...nextInfo };
    if (visualChanged) {
      this.rig.setAccentColor(nextInfo.color);
      this.rebuildNameplate(this.currentNameplateStatus);
    }
  }

  public pushSnapshot(snapshot: CharacterSyncPayload): void {
    if (snapshot.seq <= this.lastAcceptedSeq && this.hasReceivedSnapshot) {
      return;
    }
    this.lastAcceptedSeq = snapshot.seq;

    // Detect hand grab release events so remote arms show crisp release/throw recoil
    if (this.hasReceivedSnapshot) {
      if (snapshot.leftHand.releaseSeq > this.lastLeftReleaseSeq) {
        this.releaseRecoilLeft = 0.22;
      }
      if (snapshot.rightHand.releaseSeq > this.lastRightReleaseSeq) {
        this.releaseRecoilRight = 0.22;
      }
    }
    this.lastLeftReleaseSeq = snapshot.leftHand.releaseSeq;
    this.lastRightReleaseSeq = snapshot.rightHand.releaseSeq;

    // Snap immediately on very first snapshot or large respawn teleport
    if (!this.hasReceivedSnapshot) {
      this.hasReceivedSnapshot = true;
      this.currentPos.set(snapshot.pos[0], snapshot.pos[1], snapshot.pos[2]);
      this.currentQuat.set(snapshot.quat[0], snapshot.quat[1], snapshot.quat[2], snapshot.quat[3]);
      this.currentGroundY = snapshot.groundY;
      this.currentSquash = snapshot.squash;
      this.currentRagdoll = snapshot.ragdollBlend;
      this.currentStridePhase = snapshot.stridePhase;
      this.snapshots.length = 0;
      this.snapshots.push(snapshot);
      return;
    }

    const prev = this.snapshots[this.snapshots.length - 1];
    if (prev) {
      const dx = snapshot.pos[0] - prev.pos[0];
      const dy = snapshot.pos[1] - prev.pos[1];
      const dz = snapshot.pos[2] - prev.pos[2];
      if (dx * dx + dy * dy + dz * dz > TELEPORT_SNAP_DISTANCE_SQ) {
        // Remote player respawned or reset: flush stale buffer so they never slide through walls
        this.snapshots.length = 0;
        this.currentPos.set(snapshot.pos[0], snapshot.pos[1], snapshot.pos[2]);
        this.currentQuat.set(snapshot.quat[0], snapshot.quat[1], snapshot.quat[2], snapshot.quat[3]);
      }
    }

    this.snapshots.push(snapshot);
    if (this.snapshots.length > MAX_BUFFER_SIZE) {
      this.snapshots.splice(0, this.snapshots.length - MAX_BUFFER_SIZE);
    }
  }

  public update(
    dt: number,
    elapsedSeconds: number,
    cameraPosition: THREE.Vector3,
    serverClockOffsetMs: number,
    jitterMs = 0,
  ): void {
    const safeDt = Math.min(dt, 0.05);
    if (this.releaseRecoilLeft > 0) this.releaseRecoilLeft = Math.max(0, this.releaseRecoilLeft - safeDt);
    if (this.releaseRecoilRight > 0) this.releaseRecoilRight = Math.max(0, this.releaseRecoilRight - safeDt);

    if (this.snapshots.length === 0) {
      this.syncBoostCollider(safeDt);
      this.updateNameplateTransform(cameraPosition);
      return;
    }

    // Target render timestamp on server clock (adaptive delay absorbs latency jitter smoothly)
    const estimatedServerNow = Date.now() + serverClockOffsetMs;
    const interpDelayMs = THREE.MathUtils.clamp(
      BASE_INTERPOLATION_DELAY_MS + jitterMs * 1.5,
      BASE_INTERPOLATION_DELAY_MS,
      MAX_INTERPOLATION_DELAY_MS,
    );
    const renderTime = estimatedServerNow - interpDelayMs;

    let s0 = this.snapshots[0];
    let s1 = this.snapshots[this.snapshots.length - 1];
    let alpha = 1;
    let extrapSec = 0;

    if (this.snapshots.length >= 2) {
      if (renderTime <= this.snapshots[0].serverTime) {
        s0 = this.snapshots[0];
        s1 = this.snapshots[1];
        alpha = 0;
      } else if (renderTime >= s1.serverTime) {
        s0 = s1;
        alpha = 1;
        // Bounded short velocity extrapolation prevents slow-motion feel if a packet arrives slightly late
        extrapSec = THREE.MathUtils.clamp((renderTime - s1.serverTime) / 1000, 0, MAX_EXTRAPOLATION_MS / 1000);
      } else {
        for (let i = 0; i < this.snapshots.length - 1; i++) {
          const a = this.snapshots[i];
          const b = this.snapshots[i + 1];
          if (renderTime >= a.serverTime && renderTime <= b.serverTime) {
            s0 = a;
            s1 = b;
            const span = Math.max(1, b.serverTime - a.serverTime);
            alpha = THREE.MathUtils.clamp((renderTime - a.serverTime) / span, 0, 1);
            break;
          }
        }
      }
    }

    // 1. Interpolate rigid-body position & quaternion smoothly
    _posA.set(s0.pos[0], s0.pos[1], s0.pos[2]);
    _posB.set(s1.pos[0], s1.pos[1], s1.pos[2]);
    _interpPos.lerpVectors(_posA, _posB, alpha);

    if (extrapSec > 0.0005) {
      // Exponentially damped extrapolation prevents overshoot while keeping motion snappy
      const dampFactor = 1 - extrapSec * 3.0;
      _velVec.set(s1.vel[0], s1.vel[1], s1.vel[2]);
      _interpPos.addScaledVector(_velVec, extrapSec * Math.max(0.35, dampFactor));
    }

    _quatA.set(s0.quat[0], s0.quat[1], s0.quat[2], s0.quat[3]);
    _quatB.set(s1.quat[0], s1.quat[1], s1.quat[2], s1.quat[3]);
    _interpQuat.slerpQuaternions(_quatA, _quatB, alpha);

    // Subtle exponential smoothing catches any residual clock drift cleanly without sluggishness
    const smoothFactor = 1 - Math.exp(-26 * safeDt);
    if (this.currentPos.distanceToSquared(_interpPos) > TELEPORT_SNAP_DISTANCE_SQ) {
      this.currentPos.copy(_interpPos);
      this.currentQuat.copy(_interpQuat);
    } else {
      this.currentPos.lerp(_interpPos, smoothFactor);
      this.currentQuat.slerp(_interpQuat, smoothFactor);
    }

    this.root.position.copy(this.currentPos);
    this.root.quaternion.copy(this.currentQuat);
    this.syncBoostCollider(safeDt);

    // 2. Squash & stretch, head orientation, ragdoll blend
    const targetSquash = THREE.MathUtils.lerp(s0.squash, s1.squash, alpha);
    const targetRagdoll = THREE.MathUtils.lerp(s0.ragdollBlend, s1.ragdollBlend, alpha);
    this.currentSquash = THREE.MathUtils.damp(this.currentSquash, targetSquash, 18, safeDt);
    this.currentRagdoll = THREE.MathUtils.damp(this.currentRagdoll, targetRagdoll, 14, safeDt);
    this.currentGroundY = THREE.MathUtils.damp(
      this.currentGroundY,
      THREE.MathUtils.lerp(s0.groundY, s1.groundY, alpha),
      18,
      safeDt,
    );

    const scaleY = 1 + this.currentSquash;
    const scaleXZ = 1 - this.currentSquash * 0.44;
    this.rig.bodyVisual.scale.set(scaleXZ, scaleY, scaleXZ);
    this.rig.bodyVisual.position.y = (scaleY - 1) * CHARACTER_BODY_HALF_HEIGHT;

    this.rig.headPivot.rotation.set(
      THREE.MathUtils.lerp(s0.headRot[0], s1.headRot[0], alpha),
      THREE.MathUtils.lerp(s0.headRot[1], s1.headRot[1], alpha),
      THREE.MathUtils.lerp(s0.headRot[2], s1.headRot[2], alpha),
    );

    // 3. Synchronize independent left & right hand rotations, elbows, wrist cuffs & grab indicators
    this.applySyncedHand(
      -1,
      s0.leftHand,
      s1.leftHand,
      alpha,
      elapsedSeconds,
      this.releaseRecoilLeft,
      this.rig.leftArmPivot,
      this.rig.leftForearmPivot,
      this.rig.leftHandTipAnchor,
      this.rig.leftHandRingMesh,
      this.rig.leftHandRingMat,
      this.leftInteractionVis,
    );
    this.applySyncedHand(
      1,
      s0.rightHand,
      s1.rightHand,
      alpha,
      elapsedSeconds,
      this.releaseRecoilRight,
      this.rig.rightArmPivot,
      this.rig.rightForearmPivot,
      this.rig.rightHandTipAnchor,
      this.rig.rightHandRingMesh,
      this.rig.rightHandRingMat,
      this.rightInteractionVis,
    );

    // 4. Synchronized legs & knees (matches local PlayerCharacter locomotion, air kick, climbing & ragdoll)
    const horizSpeed = Math.hypot(
      THREE.MathUtils.lerp(s0.vel[0], s1.vel[0], alpha),
      THREE.MathUtils.lerp(s0.vel[2], s1.vel[2], alpha),
    );
    const vy = THREE.MathUtils.lerp(s0.vel[1], s1.vel[1], alpha);
    const grounded = alpha >= 0.5 ? s1.grounded : s0.grounded;
    const hanging = alpha >= 0.5 ? s1.hanging : s0.hanging;
    const climbing = alpha >= 0.5 ? s1.climbing : s0.climbing;
    const shimmySpeed = THREE.MathUtils.lerp(s0.shimmySpeed, s1.shimmySpeed, alpha);

    // Advance stride phase smoothly toward replicated phase so steps never freeze between ticks
    const targetMoveIntensity = grounded ? THREE.MathUtils.clamp(horizSpeed / 4.2, 0, 1.75) : 0;
    this.currentMoveIntensity = THREE.MathUtils.damp(this.currentMoveIntensity, targetMoveIntensity, 12, safeDt);
    const targetStride = THREE.MathUtils.lerp(s0.stridePhase, s1.stridePhase, alpha);
    if (Math.abs(targetStride - this.currentStridePhase) > 4.0) {
      this.currentStridePhase = targetStride;
    } else {
      this.currentStridePhase = THREE.MathUtils.damp(this.currentStridePhase, targetStride, 18, safeDt);
      if (grounded && horizSpeed > 0.35 && extrapSec > 0) {
        this.currentStridePhase += horizSpeed * 2.0 * safeDt;
      }
    }

    this.currentHangBlend = THREE.MathUtils.damp(this.currentHangBlend, hanging && !grounded ? 1 : 0, 12, safeDt);
    if (hanging && Math.abs(shimmySpeed) > 0.12) {
      this.shimmyPhase += Math.abs(shimmySpeed) * 4.4 * safeDt;
    }

    const strideSin = Math.sin(this.currentStridePhase);
    const strideCos = Math.cos(this.currentStridePhase);
    const strideAmp = Math.min(1.45, this.currentMoveIntensity);
    const airborneFactor = grounded ? 0 : 1;
    const fallSpeed = THREE.MathUtils.clamp(-vy / 9, -0.45, 1.25);
    const fastFall = airborneFactor * THREE.MathUtils.clamp((-vy - 3.2) / 7.5, 0, 1);
    const effortBrace =
      s1.interactionMode !== 'none' && grounded ? 0.12 + s1.interactionStrain * 0.18 : 0;

    let targetLeftHip = grounded
      ? strideSin * 0.64 * strideAmp - effortBrace * 0.65
      : airborneFactor * (0.28 + Math.sin(elapsedSeconds * (9.2 + fastFall * 5.2)) * (0.18 + fastFall * 0.34)) - 0.16;
    let targetRightHip = grounded
      ? -strideSin * 0.64 * strideAmp - effortBrace * 0.65
      : -airborneFactor * (0.21 + Math.sin(elapsedSeconds * (9.2 + fastFall * 5.2)) * (0.14 + fastFall * 0.26)) - 0.16;
    let targetLeftKnee = grounded
      ? Math.max(0, -strideCos) * 0.55 * Math.min(1.2, strideAmp) + effortBrace * 1.15
      : 0.38 + Math.max(0, -fallSpeed) * 0.25 + fastFall * 0.26;
    let targetRightKnee = grounded
      ? Math.max(0, strideCos) * 0.55 * Math.min(1.2, strideAmp) + effortBrace * 1.15
      : 0.32 + Math.max(0, -fallSpeed) * 0.25 + fastFall * 0.26;

    let legRollSpread = 0.03 + effortBrace * 0.24 + this.currentRagdoll * 0.08;
    if (this.currentHangBlend > 0.01) {
      const climbTuck = climbing ? 0.42 : 0;
      const dangleSway = Math.sin(elapsedSeconds * 3.1) * 0.14;
      const shimmyKick = Math.sin(this.shimmyPhase) * THREE.MathUtils.clamp(Math.abs(shimmySpeed) * 0.18, 0, 0.32);
      targetLeftHip = THREE.MathUtils.lerp(targetLeftHip, 0.08 + dangleSway - climbTuck * 0.75 + shimmyKick, this.currentHangBlend);
      targetRightHip = THREE.MathUtils.lerp(targetRightHip, 0.08 - dangleSway * 0.85 - climbTuck * 0.55 - shimmyKick, this.currentHangBlend);
      targetLeftKnee = THREE.MathUtils.lerp(targetLeftKnee, 0.24 + climbTuck * 1.05, this.currentHangBlend);
      targetRightKnee = THREE.MathUtils.lerp(targetRightKnee, 0.26 + climbTuck * 0.85, this.currentHangBlend);
      legRollSpread = THREE.MathUtils.lerp(legRollSpread, 0.06, this.currentHangBlend);
    }

    this.rig.leftLegPivot.rotation.set(targetLeftHip, 0, legRollSpread);
    this.rig.rightLegPivot.rotation.set(targetRightHip, 0, -legRollSpread);
    this.rig.leftShinPivot.rotation.set(targetLeftKnee, 0, 0);
    this.rig.rightShinPivot.rotation.set(targetRightKnee, 0, 0);

    // 5. Contact shadow directly beneath remote player
    const altitude = Math.max(0, this.currentPos.y - CHARACTER_BODY_HALF_HEIGHT - this.currentGroundY);
    const shadowScale = THREE.MathUtils.clamp(1 - altitude * 0.1, 0.35, 1.0);
    const shadowOpacity = THREE.MathUtils.clamp(0.44 * (1 - altitude * 0.14), 0.06, 0.44);
    this.contactShadowMesh.position.set(
      this.currentPos.x,
      this.currentGroundY + 0.03,
      this.currentPos.z,
    );
    this.contactShadowMesh.scale.setScalar(shadowScale);
    (this.contactShadowMesh.material as THREE.MeshBasicMaterial).opacity = shadowOpacity;

    // 6. Update floating nameplate status tag if interaction/ragdoll state changed
    const nextStatus = this.deriveStatusTag(s1);
    if (!this.playerInfo.isHost && nextStatus !== this.currentNameplateStatus) {
      this.currentNameplateStatus = nextStatus;
      this.rebuildNameplate(nextStatus);
    }
    this.updateNameplateTransform(cameraPosition);
  }

  private applySyncedHand(
    side: -1 | 1,
    h0: SyncedHandState,
    h1: SyncedHandState,
    alpha: number,
    elapsedSeconds: number,
    recoilRemaining: number,
    armPivot: THREE.Group,
    forearmPivot: THREE.Group,
    tipAnchor: THREE.Object3D,
    ringMesh: THREE.Mesh,
    ringMat: THREE.MeshBasicMaterial,
    interactionVis: HandInteractionVisual,
  ): void {
    _armQuatA.set(h0.armQuat[0], h0.armQuat[1], h0.armQuat[2], h0.armQuat[3]);
    _armQuatB.set(h1.armQuat[0], h1.armQuat[1], h1.armQuat[2], h1.armQuat[3]);
    _armQuatOut.slerpQuaternions(_armQuatA, _armQuatB, alpha);
    armPivot.quaternion.copy(_armQuatOut);

    const elbowPitch =
      THREE.MathUtils.lerp(h0.elbowPitch, h1.elbowPitch, alpha) - recoilRemaining * 1.4;
    forearmPivot.rotation.set(elbowPitch, 0, 0);

    const grabbing = alpha >= 0.5 ? h1.grabbing : h0.grabbing;
    const aiming = alpha >= 0.5 ? h1.aimActive : h0.aimActive;

    // Wrist feedback ring clearly indicates aiming vs active grabbing/climbing
    ringMesh.visible = aiming || grabbing;
    if (ringMesh.visible) {
      const pulse = grabbing ? 1 + Math.sin(elapsedSeconds * 8) * 0.08 : 0.92;
      ringMesh.scale.setScalar(pulse);
      ringMat.opacity = grabbing ? 0.92 : 0.42;
      ringMat.color.setHex(grabbing ? (side === -1 ? 0x2563eb : 0xea580c) : 0x94a3b8);
    }

    // Show crisp world-space grab contact marker + tether line when remote player holds a block or ledge
    const targetPt = h1.targetPoint ?? h0.targetPoint;
    if (grabbing && targetPt) {
      if (h0.targetPoint && h1.targetPoint) {
        _targetPointA.set(h0.targetPoint[0], h0.targetPoint[1], h0.targetPoint[2]);
        _targetPointB.set(h1.targetPoint[0], h1.targetPoint[1], h1.targetPoint[2]);
        _targetPointOut.lerpVectors(_targetPointA, _targetPointB, alpha);
      } else {
        _targetPointOut.set(targetPt[0], targetPt[1], targetPt[2]);
      }

      this.root.updateMatrixWorld(true);
      tipAnchor.getWorldPosition(_handTipWorld);

      interactionVis.markerMesh.visible = true;
      interactionVis.markerMesh.position.copy(_targetPointOut);
      interactionVis.markerMat.color.setHex(side === -1 ? 0x2563eb : 0xea580c);

      interactionVis.tetherLine.visible = true;
      interactionVis.tetherPositions[0] = _handTipWorld.x;
      interactionVis.tetherPositions[1] = _handTipWorld.y;
      interactionVis.tetherPositions[2] = _handTipWorld.z;
      interactionVis.tetherPositions[3] = _targetPointOut.x;
      interactionVis.tetherPositions[4] = _targetPointOut.y;
      interactionVis.tetherPositions[5] = _targetPointOut.z;
      const posAttr = interactionVis.tetherLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
    } else {
      interactionVis.markerMesh.visible = false;
      interactionVis.tetherLine.visible = false;
    }
  }

  private deriveStatusTag(state: CharacterSyncPayload): string | null {
    if (state.climbing) return 'CLIMB';
    if (state.hanging) return 'HANG';
    if (state.leftHand.grabbing || state.rightHand.grabbing) return 'GRAB';
    if (state.ragdollBlend > 0.45) return 'WOBBLE';
    return null;
  }

  private rebuildNameplate(statusTag: string | null): void {
    const nextTex = createNameplateTexture(
      this.playerInfo.displayName,
      this.playerInfo.color,
      this.playerInfo.isHost,
      statusTag,
    );
    this.nameplateMaterial.map = nextTex;
    this.nameplateMaterial.needsUpdate = true;
    this.nameplateTexture.dispose();
    this.nameplateTexture = nextTex;
  }

  private updateNameplateTransform(cameraPosition: THREE.Vector3): void {
    this.nameplateSprite.position.set(
      this.currentPos.x,
      this.currentPos.y + 1.48,
      this.currentPos.z,
    );
    const dist = this.nameplateSprite.position.distanceTo(cameraPosition);
    const scaleFactor = THREE.MathUtils.clamp(0.78 + dist * 0.032, 0.85, 1.9);
    this.nameplateSprite.scale.set(1.75 * scaleFactor, 0.44 * scaleFactor, 1);
    this.nameplateMaterial.opacity = THREE.MathUtils.clamp(1.25 - dist / 45, 0.25, 0.96);
  }

  private syncBoostCollider(safeDt: number): void {
    if (!this.boostCollider) return;
    const prevX = this.boostCollider.position.x;
    const prevY = this.boostCollider.position.y;
    const prevZ = this.boostCollider.position.z;
    this.boostCollider.position.set(this.currentPos.x, this.currentPos.y, this.currentPos.z);
    if (safeDt > 0.001) {
      const vx = THREE.MathUtils.clamp((this.currentPos.x - prevX) / safeDt, -12, 12);
      const vy = THREE.MathUtils.clamp((this.currentPos.y - prevY) / safeDt, -12, 12);
      const vz = THREE.MathUtils.clamp((this.currentPos.z - prevZ) / safeDt, -12, 12);
      this.boostCollider.velocity.set(vx, vy, vz);
    }
  }

  public getWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.currentPos);
  }

  public getDebugPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.currentPos);
  }

  public dispose(): void {
    if (this.physics && this.boostCollider) {
      if (this.physics.world.bodies.includes(this.boostCollider)) {
        this.physics.world.removeBody(this.boostCollider);
      }
    }
    this.scene.remove(this.root);
    this.scene.remove(this.contactShadowMesh);
    this.scene.remove(this.nameplateSprite);
    this.scene.remove(this.leftInteractionVis.markerMesh);
    this.scene.remove(this.leftInteractionVis.tetherLine);
    this.scene.remove(this.rightInteractionVis.markerMesh);
    this.scene.remove(this.rightInteractionVis.tetherLine);

    for (const d of this.rig.disposables) {
      d.dispose();
    }
    for (const d of this.extraDisposables) {
      d.dispose();
    }
    this.nameplateTexture.dispose();
    this.nameplateMaterial.dispose();
  }
}
