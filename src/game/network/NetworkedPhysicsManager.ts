import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { DynamicBlockInstance, LevelId } from '../types';
import type {
  CoopObjectForcePayload,
  ObjectOwnershipRecord,
  PhysicsObjectSyncState,
} from './protocol';

const ACTIVE_SYNC_INTERVAL_SEC = 0.05; // 20 Hz while awake/held/moving
const IDLE_RECONCILE_INTERVAL_SEC = 1.2; // Low-bandwidth consistency check for displaced resting objects
const BASE_INTERPOLATION_DELAY_MS = 75;
const MAX_INTERPOLATION_DELAY_MS = 220;
const MAX_EXTRAPOLATION_MS = 120;
const MAX_BUFFER_SIZE = 12;
const TELEPORT_SNAP_DISTANCE_SQ = 25; // 5m snap threshold on object reset / respawn
const COOP_FORCE_TTL_MS = 220;
const MAX_COOP_FORCE_N = 95;

// Pre-allocated scratch math objects (zero GC in physics & render loops)
const _posA = new THREE.Vector3();
const _posB = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _velA = new THREE.Vector3();
const _velB = new THREE.Vector3();
const _targetVel = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();
const _targetQuat = new THREE.Quaternion();
const _currQuat = new THREE.Quaternion();
const _servoForce = new CANNON.Vec3();
const _applyPoint = new CANNON.Vec3();

interface QueuedCoopForce {
  payload: CoopObjectForcePayload;
  receivedAtMs: number;
}

interface TrackedObjectEntry {
  block: DynamicBlockInstance;
  ownership: ObjectOwnershipRecord | null;
  snapshots: PhysicsObjectSyncState[];
  localSeq: number;
  lastSentPos: [number, number, number];
  lastSentQuat: [number, number, number, number];
  lastSentAwake: boolean;
  lastSentAtSec: number;
  lastAppliedVersion: number;
  lastAppliedSeq: number;
  coopForces: Map<string, QueuedCoopForce>;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface NetworkedPhysicsCallbacks {
  onSendObjectsSync: (levelId: LevelId, objects: PhysicsObjectSyncState[]) => void;
  onSendCoopForce: (payload: CoopObjectForcePayload) => void;
}

/**
 * Step 9.3 & 9.5: Authoritative-owner physics synchronization manager for shared
 * dynamic objects (wooden boxes, crates, heavy metal crates, planks, boulders/spheres,
 * and physics rope handles).
 *
 * Authority model:
 * - Room host is default authority for unheld objects.
 * - First player to grab an object becomes its authoritative simulator (ownerId).
 * - Additional players grabbing the same object send clamped cooperative assist forces
 *   directly to the owner so two players can lift/push/pull heavy objects without fighting.
 * - Non-owners smoothly track owner snapshots via adaptive-delay interpolation and
 *   velocity-servo convergence, preventing vibration, floor clipping, and teleporting.
 */
export class NetworkedPhysicsManager {
  private readonly callbacks: NetworkedPhysicsCallbacks;
  private readonly entries = new Map<string, TrackedObjectEntry>();

  private activeLevelId: LevelId = 'dream-world';
  private localPlayerId: string | null = null;
  private isHost = false;
  private serverClockOffsetMs = 0;
  private jitterMs = 0;

  private syncAccumulatorSec = 0;
  private elapsedSec = 0;
  private coopEmitAccumSec = 0;

  constructor(callbacks: NetworkedPhysicsCallbacks) {
    this.callbacks = callbacks;
  }

  public setSession(
    localPlayerId: string | null,
    isHost: boolean,
    serverClockOffsetMs: number,
    jitterMs = 0,
  ): void {
    this.localPlayerId = localPlayerId;
    this.isHost = isHost;
    this.serverClockOffsetMs = serverClockOffsetMs;
    this.jitterMs = jitterMs;
    if (!localPlayerId) {
      this.clearNetworkState();
    }
  }

  public bindLevelObjects(levelId: LevelId, blocks: DynamicBlockInstance[]): void {
    this.activeLevelId = levelId;
    this.entries.clear();
    this.syncAccumulatorSec = 0;
    this.elapsedSec = 0;

    for (const block of blocks) {
      const id = block.spec.id;
      if (!id || this.entries.has(id)) continue;
      const p = block.body.position;
      const q = block.body.quaternion;
      this.entries.set(id, {
        block,
        ownership: null,
        snapshots: [],
        localSeq: 0,
        lastSentPos: [p.x, p.y, p.z],
        lastSentQuat: [q.x, q.y, q.z, q.w],
        lastSentAwake: false,
        lastSentAtSec: -10,
        lastAppliedVersion: -1,
        lastAppliedSeq: -1,
        coopForces: new Map(),
      });
    }
  }

  public clearNetworkState(): void {
    for (const entry of this.entries.values()) {
      entry.ownership = null;
      entry.snapshots.length = 0;
      entry.lastAppliedVersion = -1;
      entry.lastAppliedSeq = -1;
      entry.coopForces.clear();
    }
  }

  public isActive(): boolean {
    return this.localPlayerId !== null;
  }

  public isLocalOwner(objectId: string): boolean {
    if (!this.localPlayerId) return true;
    const entry = this.entries.get(objectId);
    if (!entry) return this.isHost;
    if (entry.ownership) {
      return entry.ownership.ownerId === this.localPlayerId;
    }
    return this.isHost;
  }

  public isRemoteOwned(objectId: string): boolean {
    return this.isActive() && !this.isLocalOwner(objectId);
  }

  public getHolderCount(objectId: string): number {
    const entry = this.entries.get(objectId);
    if (!entry?.ownership) return 0;
    return entry.ownership.holders.length;
  }

  public applyOwnershipRecord(record: ObjectOwnershipRecord): void {
    const entry = this.entries.get(record.objectId);
    if (!entry) return;
    if (entry.ownership && record.version < entry.ownership.version) {
      return;
    }

    const wasLocalOwner = this.isLocalOwner(record.objectId);
    entry.ownership = {
      ...record,
      holders: record.holders.map((h) => ({ ...h })),
    };
    const isNowLocalOwner = this.isLocalOwner(record.objectId);

    // Clear stale remote snapshots when taking ownership so local physics takes over cleanly
    if (isNowLocalOwner && !wasLocalOwner) {
      entry.snapshots.length = 0;
      entry.block.body.wakeUp();
    }
    if (!isNowLocalOwner) {
      entry.coopForces.clear();
    }
  }

  public applySyncAll(
    levelId: LevelId,
    objects: PhysicsObjectSyncState[],
    ownerships: ObjectOwnershipRecord[],
  ): void {
    if (levelId !== this.activeLevelId) return;
    for (const rec of ownerships) {
      this.applyOwnershipRecord(rec);
    }
    for (const obj of objects) {
      this.pushRemoteObjectSnapshot(obj, true);
    }
  }

  public applyObjectsSync(levelId: LevelId, objects: PhysicsObjectSyncState[]): void {
    if (levelId !== this.activeLevelId) return;
    for (const obj of objects) {
      this.pushRemoteObjectSnapshot(obj, false);
    }
  }

  private pushRemoteObjectSnapshot(state: PhysicsObjectSyncState, snapImmediately: boolean): void {
    if (!this.localPlayerId || state.ownerId === this.localPlayerId) return;
    const entry = this.entries.get(state.objectId);
    if (!entry) return;

    // Ignore older ownership versions or out-of-order packets for the same version
    if (state.version < entry.lastAppliedVersion) return;
    if (state.version === entry.lastAppliedVersion && state.seq <= entry.lastAppliedSeq) {
      return;
    }

    // Update cached ownership if snapshot carries a newer version
    if (!entry.ownership || state.version >= entry.ownership.version) {
      entry.ownership = {
        objectId: state.objectId,
        ownerId: state.ownerId,
        version: state.version,
        holders: state.holders.map((h) => ({ ...h })),
        updatedAt: state.serverTime,
      };
    }

    entry.lastAppliedVersion = state.version;
    entry.lastAppliedSeq = state.seq;

    const prev = entry.snapshots[entry.snapshots.length - 1];
    if (snapImmediately || !prev) {
      entry.snapshots.length = 0;
      entry.snapshots.push(state);
      if (snapImmediately) {
        const body = entry.block.body;
        body.position.set(state.pos[0], state.pos[1], state.pos[2]);
        body.quaternion.set(state.quat[0], state.quat[1], state.quat[2], state.quat[3]);
        body.velocity.set(state.vel[0], state.vel[1], state.vel[2]);
        body.angularVelocity.set(state.angVel[0], state.angVel[1], state.angVel[2]);
        body.wakeUp();
      }
      return;
    }

    // Flush buffer on large resets/teleports so object never flies through walls
    const dx = state.pos[0] - prev.pos[0];
    const dy = state.pos[1] - prev.pos[1];
    const dz = state.pos[2] - prev.pos[2];
    if (dx * dx + dy * dy + dz * dz > TELEPORT_SNAP_DISTANCE_SQ) {
      entry.snapshots.length = 0;
    }

    entry.snapshots.push(state);
    if (entry.snapshots.length > MAX_BUFFER_SIZE) {
      entry.snapshots.splice(0, entry.snapshots.length - MAX_BUFFER_SIZE);
    }
  }

  public enqueueCoopForce(payload: CoopObjectForcePayload): void {
    if (!this.localPlayerId || payload.levelId !== this.activeLevelId) return;
    const entry = this.entries.get(payload.objectId);
    if (!entry || !this.isLocalOwner(payload.objectId)) return;

    const key = `${payload.fromPlayerId}:${payload.side}`;
    entry.coopForces.set(key, {
      payload,
      receivedAtMs: Date.now(),
    });
  }

  public emitCoopForceFromLocalHelper(
    objectId: string,
    side: 'left' | 'right',
    mode: 'carry' | 'push' | 'pull',
    fx: number,
    fy: number,
    fz: number,
    wx: number,
    wy: number,
    wz: number,
  ): void {
    if (!this.localPlayerId || this.isLocalOwner(objectId)) return;
    // Throttle helper force packets to ~20 Hz so network traffic stays lean
    if (this.coopEmitAccumSec < 0.048) return;
    this.coopEmitAccumSec = 0;

    const mag = Math.hypot(fx, fy, fz);
    let cfx = fx;
    let cfy = fy;
    let cfz = fz;
    if (mag > MAX_COOP_FORCE_N) {
      const s = MAX_COOP_FORCE_N / mag;
      cfx *= s;
      cfy *= s;
      cfz *= s;
    }

    this.callbacks.onSendCoopForce({
      objectId,
      levelId: this.activeLevelId,
      fromPlayerId: this.localPlayerId,
      side,
      mode,
      force: [round2(cfx), round2(cfy), round2(cfz)],
      worldPoint: [round3(wx), round3(wy), round3(wz)],
      serverTime: Date.now() + this.serverClockOffsetMs,
    });
  }

  /**
   * Called inside the 60 Hz Cannon-es physics substep:
   * 1. Applies queued cooperative helper forces onto locally owned objects (enabling
   *    two-player lifting, pushing, and pulling on heavy crates/boulders).
   * 2. Drives remotely owned objects smoothly toward their buffered interpolated pose
   *    using bounded velocity-servo tracking so collisions/stacking/climbing remain rock-solid.
   */
  public stepPhysics(fixedDt: number): void {
    if (!this.localPlayerId) return;

    this.coopEmitAccumSec += fixedDt;
    const nowMs = Date.now();
    const estimatedServerNow = nowMs + this.serverClockOffsetMs;
    const interpDelayMs = THREE.MathUtils.clamp(
      BASE_INTERPOLATION_DELAY_MS + this.jitterMs * 1.5,
      BASE_INTERPOLATION_DELAY_MS,
      MAX_INTERPOLATION_DELAY_MS,
    );
    const renderTime = estimatedServerNow - interpDelayMs;

    for (const [objectId, entry] of this.entries.entries()) {
      const body = entry.block.body;

      if (this.isLocalOwner(objectId)) {
        // Apply valid cooperative assist forces from teammates holding the same object
        if (entry.coopForces.size > 0) {
          let activeCoopCount = 0;
          for (const [key, queued] of entry.coopForces.entries()) {
            if (nowMs - queued.receivedAtMs > COOP_FORCE_TTL_MS) {
              entry.coopForces.delete(key);
              continue;
            }
            activeCoopCount += 1;
            const p = queued.payload;
            // Cooperative teamwork bonus on heavy objects (mass >= 3.0 kg feels noticeably easier together!)
            const coopBonus = body.mass >= 3.0 ? 1.28 : 1.08;
            _servoForce.set(
              p.force[0] * coopBonus,
              p.force[1] * coopBonus,
              p.force[2] * coopBonus,
            );
            // Apply with conservative lever arm so two players never spin an object violently
            _applyPoint.set(
              body.position.x + (p.worldPoint[0] - body.position.x) * 0.45,
              body.position.y + (p.worldPoint[1] - body.position.y) * 0.45,
              body.position.z + (p.worldPoint[2] - body.position.z) * 0.45,
            );
            body.applyForce(_servoForce, _applyPoint);
            body.wakeUp();
          }

          // Subtle extra rotational stability when two players carry a heavy crate together
          if (activeCoopCount > 0) {
            const stab = 0.85 * body.mass;
            body.torque.x -= body.angularVelocity.x * stab;
            body.torque.y -= body.angularVelocity.y * stab * 0.6;
            body.torque.z -= body.angularVelocity.z * stab;
          }
        }
        continue;
      }

      // === REMOTELY OWNED OBJECT: Smooth snapshot-buffered velocity-servo tracking ===
      const snaps = entry.snapshots;
      if (snaps.length === 0) continue;

      let s0 = snaps[0];
      let s1 = snaps[snaps.length - 1];
      let alpha = 1;
      let extrapSec = 0;

      if (snaps.length >= 2) {
        if (renderTime <= snaps[0].serverTime) {
          s0 = snaps[0];
          s1 = snaps[1];
          alpha = 0;
        } else if (renderTime >= s1.serverTime) {
          s0 = s1;
          alpha = 1;
          extrapSec = THREE.MathUtils.clamp(
            (renderTime - s1.serverTime) / 1000,
            0,
            MAX_EXTRAPOLATION_MS / 1000,
          );
        } else {
          for (let i = 0; i < snaps.length - 1; i++) {
            const a = snaps[i];
            const b = snaps[i + 1];
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

      _posA.set(s0.pos[0], s0.pos[1], s0.pos[2]);
      _posB.set(s1.pos[0], s1.pos[1], s1.pos[2]);
      _targetPos.lerpVectors(_posA, _posB, alpha);

      _velA.set(s0.vel[0], s0.vel[1], s0.vel[2]);
      _velB.set(s1.vel[0], s1.vel[1], s1.vel[2]);
      _targetVel.lerpVectors(_velA, _velB, alpha);

      if (extrapSec > 0.0005 && s1.awake) {
        const damp = Math.max(0.3, 1 - extrapSec * 3.5);
        _targetPos.addScaledVector(_targetVel, extrapSec * damp);
      }

      _quatA.set(s0.quat[0], s0.quat[1], s0.quat[2], s0.quat[3]);
      _quatB.set(s1.quat[0], s1.quat[1], s1.quat[2], s1.quat[3]);
      _targetQuat.slerpQuaternions(_quatA, _quatB, alpha);

      const errX = _targetPos.x - body.position.x;
      const errY = _targetPos.y - body.position.y;
      const errZ = _targetPos.z - body.position.z;
      const errDistSq = errX * errX + errY * errY + errZ * errZ;

      const isRemotelyHeld = s1.holders.length > 0;

      if (errDistSq > TELEPORT_SNAP_DISTANCE_SQ) {
        // Snap cleanly on object reset or extreme drift (never shoots through floors/walls)
        body.position.set(_targetPos.x, _targetPos.y, _targetPos.z);
        body.quaternion.set(_targetQuat.x, _targetQuat.y, _targetQuat.z, _targetQuat.w);
        body.velocity.set(_targetVel.x, _targetVel.y, _targetVel.z);
        body.angularVelocity.set(s1.angVel[0], s1.angVel[1], s1.angVel[2]);
      } else {
        // Cancel local gravity when a remote player is holding the object mid-air so it never sags/jitters
        if (isRemotelyHeld) {
          _servoForce.set(0, body.mass * 9.81, 0);
          body.applyForce(_servoForce, body.position);
        }

        // Smooth velocity convergence keeps contacts/stacking/climbing physically solid without vibration
        const gain = isRemotelyHeld ? 16 : 11;
        const desiredVx = THREE.MathUtils.clamp(_targetVel.x + errX * gain, -24, 24);
        const desiredVy = THREE.MathUtils.clamp(_targetVel.y + errY * gain, -24, 24);
        const desiredVz = THREE.MathUtils.clamp(_targetVel.z + errZ * gain, -24, 24);

        const blend = 1 - Math.exp(-(isRemotelyHeld ? 24 : 18) * fixedDt);
        body.velocity.x = THREE.MathUtils.lerp(body.velocity.x, desiredVx, blend);
        body.velocity.y = THREE.MathUtils.lerp(body.velocity.y, desiredVy, blend);
        body.velocity.z = THREE.MathUtils.lerp(body.velocity.z, desiredVz, blend);

        // Gently blend quaternion & angular velocity toward authoritative orientation
        _currQuat.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
        _currQuat.slerp(_targetQuat, 1 - Math.exp(-16 * fixedDt));
        body.quaternion.set(_currQuat.x, _currQuat.y, _currQuat.z, _currQuat.w);

        body.angularVelocity.set(
          THREE.MathUtils.lerp(body.angularVelocity.x, s1.angVel[0], 0.35),
          THREE.MathUtils.lerp(body.angularVelocity.y, s1.angVel[1], 0.35),
          THREE.MathUtils.lerp(body.angularVelocity.z, s1.angVel[2], 0.35),
        );

        // Tight settle clamp when object is resting on floor/stack so zero micro-jitter occurs
        if (!s1.awake && errDistSq < 0.0025) {
          body.position.set(_targetPos.x, _targetPos.y, _targetPos.z);
          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
        }
      }
      body.wakeUp();
    }
  }

  /**
   * Publishes delta-only throttled snapshots for locally owned objects.
   * Resting objects transmit 0 bytes/sec once settled (with rare consistency reconciliation
   * only for objects displaced from their spawn pose).
   */
  public emitOwnedObjectUpdates(dt: number, forceAll = false): void {
    if (!this.localPlayerId) return;

    this.elapsedSec += dt;
    this.syncAccumulatorSec += dt;
    if (!forceAll && this.syncAccumulatorSec < ACTIVE_SYNC_INTERVAL_SEC) {
      return;
    }
    this.syncAccumulatorSec = 0;

    const batch: PhysicsObjectSyncState[] = [];
    const serverNow = Date.now() + this.serverClockOffsetMs;

    for (const [objectId, entry] of this.entries.entries()) {
      if (!this.isLocalOwner(objectId)) continue;

      const body = entry.block.body;
      const speedSq = body.velocity.lengthSquared();
      const angSpeedSq = body.angularVelocity.lengthSquared();
      const isHeld = Boolean(entry.ownership && entry.ownership.holders.length > 0);
      const awake = isHeld || speedSq > 0.006 || angSpeedSq > 0.01;

      const dx = body.position.x - entry.lastSentPos[0];
      const dy = body.position.y - entry.lastSentPos[1];
      const dz = body.position.z - entry.lastSentPos[2];
      const posDeltaSq = dx * dx + dy * dy + dz * dz;

      const qDot = Math.abs(
        body.quaternion.x * entry.lastSentQuat[0] +
          body.quaternion.y * entry.lastSentQuat[1] +
          body.quaternion.z * entry.lastSentQuat[2] +
          body.quaternion.w * entry.lastSentQuat[3],
      );
      const rotChanged = qDot < 0.9992;

      const [ix, iy, iz] = entry.block.spec.initialPosition;
      const displacedFromSpawn =
        (body.position.x - ix) ** 2 +
          (body.position.y - iy) ** 2 +
          (body.position.z - iz) ** 2 >
        0.04;

      const needsSettlePacket = entry.lastSentAwake && !awake;
      const needsReconcile =
        displacedFromSpawn &&
        this.elapsedSec - entry.lastSentAtSec >= IDLE_RECONCILE_INTERVAL_SEC;

      const shouldSend =
        forceAll ||
        isHeld ||
        needsSettlePacket ||
        needsReconcile ||
        (awake && (posDeltaSq > 0.00025 || rotChanged));

      if (!shouldSend) continue;

      entry.localSeq += 1;
      entry.lastSentPos = [body.position.x, body.position.y, body.position.z];
      entry.lastSentQuat = [
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w,
      ];
      entry.lastSentAwake = awake;
      entry.lastSentAtSec = this.elapsedSec;

      batch.push({
        objectId,
        levelId: this.activeLevelId,
        ownerId: this.localPlayerId,
        version: entry.ownership?.version ?? 0,
        seq: entry.localSeq,
        serverTime: serverNow,
        pos: [round3(body.position.x), round3(body.position.y), round3(body.position.z)],
        quat: [
          round3(body.quaternion.x),
          round3(body.quaternion.y),
          round3(body.quaternion.z),
          round3(body.quaternion.w),
        ],
        vel: [round2(body.velocity.x), round2(body.velocity.y), round2(body.velocity.z)],
        angVel: [
          round2(body.angularVelocity.x),
          round2(body.angularVelocity.y),
          round2(body.angularVelocity.z),
        ],
        awake,
        holders: entry.ownership ? entry.ownership.holders.map((h) => ({ ...h })) : [],
      });
    }

    // Split into clean packets of <= 24 objects so payload size stays well under limit
    for (let i = 0; i < batch.length; i += 24) {
      this.callbacks.onSendObjectsSync(this.activeLevelId, batch.slice(i, i + 24));
    }
  }

  public dispose(): void {
    this.entries.clear();
  }
}
