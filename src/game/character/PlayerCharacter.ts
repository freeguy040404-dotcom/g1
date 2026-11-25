import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ProceduralTextureSet } from '../textures';
import type { ProceduralAudio } from '../audio';
import type {
  CharacterInteractionPose,
  HandAimDirective,
  HandSide,
  HangingCharacterState,
} from '../types';
import { buildHumanoidVisualRig, type HumanoidVisualRig } from './CharacterRig';

const SPAWN_POSITION = new THREE.Vector3(0, 4.6, 0.4);
// Distance from rigid-body center to bottom of character boots
const BODY_HALF_HEIGHT = 0.9;

const WALK_SPEED = 4.2;
const RUN_SPEED = 7.2;
const JUMP_ANTICIPATION_SECONDS = 0.072;
const JUMP_COOLDOWN_SECONDS = 0.32;
const COYOTE_TIME_SECONDS = 0.1;

interface SpringOscillator {
  value: number;
  velocity: number;
}

function stepSpring(
  spring: SpringOscillator,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): number {
  const force = (target - spring.value) * stiffness - spring.velocity * damping;
  spring.velocity += force * dt;
  spring.value += spring.velocity * dt;
  return spring.value;
}

// Reusable scratch objects (zero GC in physics & render loops)
const _upWorld = new CANNON.Vec3(0, 1, 0);
const _localForwardRef = new CANNON.Vec3(0, 0, -1);
const _localUp = new CANNON.Vec3();
const _worldForward = new CANNON.Vec3();
const _targetUp = new CANNON.Vec3();
const _torqueAxis = new CANNON.Vec3();
const _rayFrom = new CANNON.Vec3();
const _rayTo = new CANNON.Vec3();
const _rayResult = new CANNON.RaycastResult();
const _impulseVec = new CANNON.Vec3();
const _impulsePoint = new CANNON.Vec3();

const _velCurr = new THREE.Vector3();
const _accelWorld = new THREE.Vector3();
const _accelLocal = new THREE.Vector3();
const _invQuat = new THREE.Quaternion();
const _nudgeDir = new THREE.Vector3();
const _worldUpThree = new THREE.Vector3(0, 1, 0);
const _armRestDown = new THREE.Vector3(0, -1, 0);
const _localAimPoint = new THREE.Vector3();
const _localAimDir = new THREE.Vector3();
const _baseArmQuat = new THREE.Quaternion();
const _aimArmQuat = new THREE.Quaternion();
const _reachBiasDir = new THREE.Vector3();

const GROUND_RAY_OFFSETS: [number, number][] = [
  [0, 0],
  [0.2, 0],
  [-0.2, 0],
  [0, 0.2],
  [0, -0.2],
];

export class PlayerCharacter {
  public readonly root = new THREE.Group();
  public readonly body: CANNON.Body;

  private readonly rig: HumanoidVisualRig;
  private readonly bodyVisual: THREE.Group;
  private readonly headPivot: THREE.Group;
  private readonly leftArmPivot: THREE.Group;
  private readonly rightArmPivot: THREE.Group;
  private readonly leftForearmPivot: THREE.Group;
  private readonly rightForearmPivot: THREE.Group;
  private readonly leftHandTipAnchor: THREE.Object3D;
  private readonly rightHandTipAnchor: THREE.Object3D;
  private leftHandRingMat: THREE.MeshBasicMaterial | null = null;
  private rightHandRingMat: THREE.MeshBasicMaterial | null = null;
  private leftHandRingMesh: THREE.Mesh | null = null;
  private rightHandRingMesh: THREE.Mesh | null = null;
  private readonly leftLegPivot: THREE.Group;
  private readonly rightLegPivot: THREE.Group;
  private readonly leftShinPivot: THREE.Group;
  private readonly rightShinPivot: THREE.Group;
  private readonly contactShadowMesh: THREE.Mesh;

  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly audio: ProceduralAudio;

  // Semi-wobbly secondary motion spring oscillators
  private readonly squashSpring: SpringOscillator = { value: 0, velocity: 0 };
  private readonly headPitchSpring: SpringOscillator = { value: 0, velocity: 0 };
  private readonly headRollSpring: SpringOscillator = { value: 0, velocity: 0 };
  private readonly headYawSpring: SpringOscillator = { value: 0, velocity: 0 };
  private readonly leftArmPitch: SpringOscillator = { value: 0, velocity: 0 };
  private readonly rightArmPitch: SpringOscillator = { value: 0, velocity: 0 };
  private readonly leftArmRoll: SpringOscillator = { value: 0.16, velocity: 0 };
  private readonly rightArmRoll: SpringOscillator = { value: -0.16, velocity: 0 };
  private readonly leftLegPitch: SpringOscillator = { value: 0, velocity: 0 };
  private readonly rightLegPitch: SpringOscillator = { value: 0, velocity: 0 };
  private readonly leftKneePitch: SpringOscillator = { value: 0, velocity: 0 };
  private readonly rightKneePitch: SpringOscillator = { value: 0, velocity: 0 };

  // Locomotion & grounding state
  private grounded = false;
  private wasGrounded = false;
  private groundSurfaceY = 0;
  private standingBody: CANNON.Body | null = null;
  private prevVerticalSpeed = 0;
  private coyoteTimer = 0;
  private jumpCooldown = 0;
  private jumpAnticipationTimer = 0;
  private nudgeGraceTimer = 0;
  private readonly spawnPosition = SPAWN_POSITION.clone();
  private fallResetY = -12;
  private onFallOutOfBounds?: () => void;

  private runBlend = 0;
  private moveIntensity = 0;
  private stridePhase = 0;
  private lastYawError = 0;
  private readonly desiredFacingDir = new THREE.Vector3(0, 0, -1);
  private readonly prevBodyVel = new THREE.Vector3();

  // Independent left/right hand aiming directives (populated by HandTargetingSystem)
  private readonly leftAimDirective: HandAimDirective = {
    active: false,
    lockedOn: false,
    worldTarget: new THREE.Vector3(),
  };
  private readonly rightAimDirective: HandAimDirective = {
    active: false,
    lockedOn: false,
    worldTarget: new THREE.Vector3(),
  };
  private leftAimBlend = 0;
  private rightAimBlend = 0;

  // Subtle push/pull body lean & heavy-effort wobble (populated by HandGrabSystem)
  private interactionLeanX = 0;
  private interactionLeanZ = 0;
  private interactionWobbleAmp = 0;
  private interactionWobblePhase = 0;

  // Hanging & climbing state (populated by LedgeClimbSystem)
  private readonly hangingState: HangingCharacterState = {
    isHanging: false,
    isClimbing: false,
    handCount: 0,
    wallNormalX: 0,
    wallNormalZ: 1,
    stretchAmount: 0,
    shimmySpeed: 0,
  };
  private hangBlend = 0;
  private shimmyPhase = 0;

  // Step 8: Hybrid ragdoll-reaction, stumble/recovery, interaction pose & throw recoil state
  private ragdollBlend = 0;
  private stumbleTimer = 0;
  private recoveryTimer = 0;
  private airTime = 0;
  private throwRecoilTimer = 0;
  private throwRecoilSide: -1 | 1 = 1;
  private readonly interactionPose: CharacterInteractionPose = {
    mode: 'none',
    heldMass: 0,
    strain: 0,
    twoHanded: false,
  };
  private onHeavyImpact?: (x: number, y: number, z: number, intensity: number) => void;
  private recentLandingTimer = 0;
  private lastSquashValue = 0;

  constructor(
    scene: THREE.Scene,
    physics: PhysicsWorld,
    textures: ProceduralTextureSet,
    audio: ProceduralAudio,
  ) {
    this.audio = audio;

    // 1. Build composite multi-part humanoid mesh via shared CharacterRig
    this.rig = buildHumanoidVisualRig(null);
    this.bodyVisual = this.rig.bodyVisual;
    this.headPivot = this.rig.headPivot;
    this.leftArmPivot = this.rig.leftArmPivot;
    this.rightArmPivot = this.rig.rightArmPivot;
    this.leftForearmPivot = this.rig.leftForearmPivot;
    this.rightForearmPivot = this.rig.rightForearmPivot;
    this.leftHandTipAnchor = this.rig.leftHandTipAnchor;
    this.rightHandTipAnchor = this.rig.rightHandTipAnchor;
    this.leftHandRingMesh = this.rig.leftHandRingMesh;
    this.leftHandRingMat = this.rig.leftHandRingMat;
    this.rightHandRingMesh = this.rig.rightHandRingMesh;
    this.rightHandRingMat = this.rig.rightHandRingMat;
    this.leftLegPivot = this.rig.leftLegPivot;
    this.rightLegPivot = this.rig.rightLegPivot;
    this.leftShinPivot = this.rig.leftShinPivot;
    this.rightShinPivot = this.rig.rightShinPivot;
    this.disposables.push(...this.rig.disposables);
    this.root.add(this.bodyVisual);
    scene.add(this.root);

    // 2. Soft dynamic radial contact shadow plane that tracks beneath the character
    const shadowGeo = new THREE.PlaneGeometry(1.55, 1.55);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.48,
    });
    this.contactShadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.contactShadowMesh.position.set(SPAWN_POSITION.x, 0.03, SPAWN_POSITION.z);
    scene.add(this.contactShadowMesh);
    this.disposables.push(shadowGeo, shadowMat);

    // 3. Build Cannon-es compound rigid body (three stacked spheres = smooth rounded capsule collider)
    this.body = new CANNON.Body({
      mass: 6.5,
      material: physics.playerMaterial,
      position: new CANNON.Vec3(SPAWN_POSITION.x, SPAWN_POSITION.y, SPAWN_POSITION.z),
      linearDamping: 0.12,
      angularDamping: 0.36,
    });

    // Lower pelvis/feet sphere: bottom reaches local y = -0.56 - 0.34 = -0.90
    this.body.addShape(new CANNON.Sphere(0.34), new CANNON.Vec3(0, -0.56, 0));
    // Mid torso sphere
    this.body.addShape(new CANNON.Sphere(0.36), new CANNON.Vec3(0, 0.04, 0));
    // Upper head sphere
    this.body.addShape(new CANNON.Sphere(0.28), new CANNON.Vec3(0, 0.62, 0));

    physics.world.addBody(this.body);

    // Detect landing & body collision impacts for audio, ragdoll stumble & dust/camera feedback
    let lastCollideMs = -1000;
    const impactPos = { x: 0, y: 0, z: 0 };
    this.body.addEventListener('collide', (event: { contact?: CANNON.ContactEquation }) => {
      if (!event.contact) return;
      const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
      if (impact < 1.9) return;
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (nowMs - lastCollideMs < 90) return;
      lastCollideMs = nowMs;

      const normalY = Math.abs(event.contact.ni.y);
      const isGroundImpact = normalY > 0.58;
      impactPos.x = this.body.position.x;
      impactPos.y = this.body.position.y - (isGroundImpact ? BODY_HALF_HEIGHT : 0);
      impactPos.z = this.body.position.z;

      this.squashSpring.velocity -= Math.min(4.6, impact * 0.48);

      if (isGroundImpact) {
        this.audio.playLandingThud(impact, impactPos);
        if (impact > 4.6) {
          const intensity = THREE.MathUtils.clamp((impact - 4.0) / 7.5, 0.25, 1.35);
          this.onHeavyImpact?.(impactPos.x, impactPos.y, impactPos.z, intensity);
        }
        // Very heavy drop induces momentary ragdoll stumble & smooth knees-bent recovery
        if (impact > 7.6) {
          this.stumbleTimer = Math.max(this.stumbleTimer, THREE.MathUtils.clamp((impact - 6.2) * 0.11, 0.25, 0.68));
          this.recoveryTimer = Math.max(this.recoveryTimer, 0.55);
          this.headPitchSpring.velocity += 2.6;
        }
      } else {
        // Lateral wall or heavy dynamic-object collision reaction
        this.audio.playCharacterCollision(impact, impactPos);
        if (impact > 4.2) {
          const stumbleDuration = THREE.MathUtils.clamp((impact - 3.6) * 0.1, 0.18, 0.52);
          this.stumbleTimer = Math.max(this.stumbleTimer, stumbleDuration);
          this.recoveryTimer = Math.max(this.recoveryTimer, 0.42);
          this.headRollSpring.velocity += (Math.random() - 0.5) * 4.5;
          this.leftArmRoll.velocity += 2.2;
          this.rightArmRoll.velocity -= 2.2;
          this.onHeavyImpact?.(
            impactPos.x,
            impactPos.y,
            impactPos.z,
            THREE.MathUtils.clamp((impact - 3.8) / 7.0, 0.2, 0.9),
          );
        }
      }
    });

    this.syncVisualFromBody(0.016, 0);
  }

  public setPlayerAccentColor(hexColor: string | null): void {
    this.rig.setAccentColor(hexColor);
  }

  private detectGround(physicsWorld: CANNON.World): boolean {
    let foundGround = false;
    let highestGroundY = -Infinity;
    let highestBody: CANNON.Body | null = null;

    for (const [ox, oz] of GROUND_RAY_OFFSETS) {
      _rayFrom.set(this.body.position.x + ox, this.body.position.y - 0.42, this.body.position.z + oz);
      _rayTo.set(
        this.body.position.x + ox,
        this.body.position.y - BODY_HALF_HEIGHT - 0.14,
        this.body.position.z + oz,
      );
      _rayResult.reset();
      physicsWorld.raycastClosest(_rayFrom, _rayTo, { skipBackfaces: true }, _rayResult);

      // Require a walkable upward-facing surface normal so vertical walls never trigger grounded jumps
      if (
        _rayResult.hasHit &&
        _rayResult.body !== this.body &&
        _rayResult.hitNormalWorld.y > 0.55
      ) {
        foundGround = true;
        if (_rayResult.hitPointWorld.y > highestGroundY) {
          highestGroundY = _rayResult.hitPointWorld.y;
          highestBody = _rayResult.body;
        }
      }
    }

    if (foundGround) {
      this.groundSurfaceY = highestGroundY;
      this.standingBody = highestBody;
    } else {
      this.standingBody = null;
      // Cast longer ray strictly for visual contact shadow height while jumping over blocks/terrace
      _rayFrom.set(this.body.position.x, this.body.position.y - 0.5, this.body.position.z);
      _rayTo.set(this.body.position.x, this.body.position.y - 14, this.body.position.z);
      _rayResult.reset();
      physicsWorld.raycastClosest(_rayFrom, _rayTo, { skipBackfaces: true }, _rayResult);
      if (_rayResult.hasHit && _rayResult.body !== this.body && _rayResult.hitNormalWorld.y > 0.5) {
        this.groundSurfaceY = _rayResult.hitPointWorld.y;
      } else {
        this.groundSurfaceY = this.body.position.y - 14;
      }
    }

    return foundGround;
  }

  public applyPreStepForces(
    dt: number,
    physicsWorld: CANNON.World,
    moveDirWorldXZ: THREE.Vector3,
    isRunning: boolean,
    consumeJump: () => boolean,
  ): void {
    // 1. Timers
    if (this.jumpCooldown > 0) this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    if (this.nudgeGraceTimer > 0) this.nudgeGraceTimer = Math.max(0, this.nudgeGraceTimer - dt);
    if (this.stumbleTimer > 0) this.stumbleTimer = Math.max(0, this.stumbleTimer - dt);
    if (this.recoveryTimer > 0) this.recoveryTimer = Math.max(0, this.recoveryTimer - dt);
    if (this.throwRecoilTimer > 0) this.throwRecoilTimer = Math.max(0, this.throwRecoilTimer - dt);
    if (this.recentLandingTimer > 0) this.recentLandingTimer = Math.max(0, this.recentLandingTimer - dt);

    // 2. Reliable multi-ray ground detection
    this.wasGrounded = this.grounded;
    const rawGrounded = this.detectGround(physicsWorld);
    // Ignore ground contact immediately after jump launch so upward impulse clears cleanly
    this.grounded = this.jumpCooldown > JUMP_COOLDOWN_SECONDS - 0.1 ? false : rawGrounded;

    if (this.grounded) {
      this.coyoteTimer = COYOTE_TIME_SECONDS;
      this.airTime = 0;
    } else {
      if (this.coyoteTimer > 0) {
        this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
      }
      if (!this.hangingState.isHanging) {
        this.airTime += dt;
      }
    }

    // Trigger landing compression, arm/head bounce, dust & stagger recovery on touchdown
    if (this.grounded && !this.wasGrounded && this.prevVerticalSpeed < -1.4) {
      this.recentLandingTimer = 0.18;
      const dropSpeed = Math.abs(this.prevVerticalSpeed);
      const dropImpulse = Math.min(5.0, dropSpeed * 0.46);
      this.squashSpring.velocity -= dropImpulse;
      this.leftArmRoll.velocity += dropImpulse * 0.88;
      this.rightArmRoll.velocity -= dropImpulse * 0.88;
      this.headPitchSpring.velocity += dropImpulse * 0.78;
      this.leftKneePitch.velocity += dropImpulse * 0.85;
      this.rightKneePitch.velocity += dropImpulse * 0.85;

      if (dropSpeed > 4.4) {
        this.recoveryTimer = Math.max(this.recoveryTimer, THREE.MathUtils.clamp((dropSpeed - 4.0) * 0.08, 0.18, 0.58));
        this.onHeavyImpact?.(
          this.body.position.x,
          this.groundSurfaceY + 0.04,
          this.body.position.z,
          THREE.MathUtils.clamp((dropSpeed - 4.0) / 7.5, 0.25, 1.3),
        );
      }
      if (dropSpeed > 8.2) {
        this.stumbleTimer = Math.max(this.stumbleTimer, 0.34);
      }
    }
    this.prevVerticalSpeed = this.body.velocity.y;

    // 3. Walking & Running physics-based locomotion (no direct body teleporting)
    const isHanging = this.hangingState.isHanging;
    const hasMoveInput = !isHanging && moveDirWorldXZ.lengthSq() > 0.01;
    const targetRunBlend = hasMoveInput && isRunning ? 1 : 0;
    const runLambda = targetRunBlend > this.runBlend ? 5.2 : 6.8;
    this.runBlend = THREE.MathUtils.damp(this.runBlend, targetRunBlend, runLambda, dt);

    const targetSpeed = hasMoveInput
      ? THREE.MathUtils.lerp(WALK_SPEED, RUN_SPEED, this.runBlend)
      : 0;

    const mass = this.body.mass;
    const vx = this.body.velocity.x;
    const vz = this.body.velocity.z;
    const horizSpeed = Math.hypot(vx, vz);

    if (!isHanging) {
      if (this.grounded) {
        // Inherit kinematic moving-platform velocity so riding lifts & cable platforms feels solid
        const platVx =
          this.standingBody && this.standingBody.type === CANNON.Body.KINEMATIC
            ? this.standingBody.velocity.x
            : 0;
        const platVz =
          this.standingBody && this.standingBody.type === CANNON.Body.KINEMATIC
            ? this.standingBody.velocity.z
            : 0;

        const desiredVx = (hasMoveInput ? moveDirWorldXZ.x * targetSpeed : 0) + platVx;
        const desiredVz = (hasMoveInput ? moveDirWorldXZ.z * targetSpeed : 0) + platVz;
        const errX = desiredVx - vx;
        const errZ = desiredVz - vz;

        // Slightly higher gain when stopping so the character never ice-skates
        const isBraking = !hasMoveInput && this.nudgeGraceTimer <= 0;
        const gain = hasMoveInput ? 10.2 : isBraking ? 12.0 : 2.5;

        let fx = errX * mass * gain;
        let fz = errZ * mass * gain;

        const maxForce = mass * 36;
        const fMag = Math.hypot(fx, fz);
        if (fMag > maxForce) {
          const scale = maxForce / fMag;
          fx *= scale;
          fz *= scale;
        }

        this.body.force.x += fx;
        this.body.force.z += fz;

        // Settle microscopic residual drift cleanly relative to standing surface
        const relHorizSpeed = Math.hypot(vx - platVx, vz - platVz);
        if (isBraking && relHorizSpeed < 0.08) {
          this.body.velocity.x = platVx + (vx - platVx) * 0.82;
          this.body.velocity.z = platVz + (vz - platVz) * 0.82;
        }
      } else if (hasMoveInput) {
        // Airborne momentum preservation with gentle responsive midair steering
        const desiredVx = moveDirWorldXZ.x * targetSpeed;
        const desiredVz = moveDirWorldXZ.z * targetSpeed;
        let fx = (desiredVx - vx) * mass * 2.4;
        let fz = (desiredVz - vz) * mass * 2.4;
        const maxAirForce = mass * 11;
        const fMag = Math.hypot(fx, fz);
        if (fMag > maxAirForce) {
          const scale = maxAirForce / fMag;
          fx *= scale;
          fz *= scale;
        }
        this.body.force.x += fx;
        this.body.force.z += fz;
      }

      // 4. Jump anticipation crouch & physical upward impulse (strictly prevented while airborne)
      const canStartJump =
        this.jumpAnticipationTimer <= 0 &&
        this.jumpCooldown <= 0 &&
        (this.grounded || this.coyoteTimer > 0);

      if (canStartJump && consumeJump()) {
        this.jumpAnticipationTimer = JUMP_ANTICIPATION_SECONDS;
        // Snappy pre-jump crouch compression & arm pull-back
        this.squashSpring.velocity = Math.min(this.squashSpring.velocity, -3.2);
        this.leftArmPitch.velocity += 2.6;
        this.rightArmPitch.velocity += 2.6;
        this.leftKneePitch.velocity += 3.2;
        this.rightKneePitch.velocity += 3.2;
      }

      if (this.jumpAnticipationTimer > 0) {
        this.jumpAnticipationTimer -= dt;
        if (this.jumpAnticipationTimer <= 0) {
          this.jumpAnticipationTimer = 0;
          if (this.grounded || this.coyoteTimer > 0) {
            if (this.body.velocity.y < 0) {
              this.body.velocity.y = 0;
            }
            const jumpImpulse = mass * 7.25;
            _impulseVec.set(0, jumpImpulse, 0);
            _impulsePoint.set(0, 0, 0);
            this.body.applyImpulse(_impulseVec, _impulsePoint);
            this.body.wakeUp();

            // Stretch upward & cheer arms out on takeoff
            this.squashSpring.velocity = 3.8;
            this.leftArmRoll.velocity += 3.6;
            this.rightArmRoll.velocity -= 3.6;
            this.leftArmPitch.velocity -= 3.4;
            this.rightArmPitch.velocity -= 3.4;
            this.audio.playJumpWhoosh();

            this.jumpCooldown = JUMP_COOLDOWN_SECONDS;
            this.coyoteTimer = 0;
            this.grounded = false;
          }
        }
      }
    } else {
      this.jumpAnticipationTimer = 0;
    }

    // 5. Smooth directional facing update (face into the wall while gripping a ledge)
    if (isHanging) {
      const faceX = -this.hangingState.wallNormalX;
      const faceZ = -this.hangingState.wallNormalZ;
      const faceLen = Math.hypot(faceX, faceZ);
      if (faceLen > 0.01) {
        this.desiredFacingDir.x = THREE.MathUtils.damp(
          this.desiredFacingDir.x,
          faceX / faceLen,
          9,
          dt,
        );
        this.desiredFacingDir.z = THREE.MathUtils.damp(
          this.desiredFacingDir.z,
          faceZ / faceLen,
          9,
          dt,
        );
        const len = Math.hypot(this.desiredFacingDir.x, this.desiredFacingDir.z);
        if (len > 0.0001) {
          this.desiredFacingDir.x /= len;
          this.desiredFacingDir.z /= len;
        }
      }
    } else if (hasMoveInput) {
      const turnRate = this.grounded ? 10 : 3.5;
      this.desiredFacingDir.x = THREE.MathUtils.damp(
        this.desiredFacingDir.x,
        moveDirWorldXZ.x,
        turnRate,
        dt,
      );
      this.desiredFacingDir.z = THREE.MathUtils.damp(
        this.desiredFacingDir.z,
        moveDirWorldXZ.z,
        turnRate,
        dt,
      );
      const len = Math.hypot(this.desiredFacingDir.x, this.desiredFacingDir.z);
      if (len > 0.0001) {
        this.desiredFacingDir.x /= len;
        this.desiredFacingDir.z /= len;
      }
    }

    // 6. Harmonized semi-wobbly upright PD stabilization + playful stride lean + smooth yaw alignment
    // Lean target up-vector gently into travel direction & slight comical waddle roll while moving
    const speedRatio = THREE.MathUtils.clamp(horizSpeed / RUN_SPEED, 0, 1);
    const leanAmount =
      this.grounded && hasMoveInput
        ? speedRatio * (0.11 + this.runBlend * 0.13)
        : 0;
    const waddleRoll =
      this.grounded && hasMoveInput
        ? Math.sin(this.stridePhase) * (0.045 + this.runBlend * 0.03) * Math.min(1, horizSpeed / 2.2)
        : 0;

    // Right vector relative to desired facing (-z forward -> right is (-z, 0, x))
    const rightX = -this.desiredFacingDir.z;
    const rightZ = this.desiredFacingDir.x;

    // Gentle physics-based reach lean when aiming one or both hands toward a target
    let reachLeanX = 0;
    let reachLeanZ = 0;
    if (this.grounded && (this.leftAimDirective.active || this.rightAimDirective.active)) {
      _reachBiasDir.set(0, 0, 0);
      let activeCount = 0;
      if (this.leftAimDirective.active) {
        _reachBiasDir.x += this.leftAimDirective.worldTarget.x - this.body.position.x;
        _reachBiasDir.z += this.leftAimDirective.worldTarget.z - this.body.position.z;
        activeCount++;
      }
      if (this.rightAimDirective.active) {
        _reachBiasDir.x += this.rightAimDirective.worldTarget.x - this.body.position.x;
        _reachBiasDir.z += this.rightAimDirective.worldTarget.z - this.body.position.z;
        activeCount++;
      }
      if (activeCount > 0) {
        const len = Math.hypot(_reachBiasDir.x, _reachBiasDir.z);
        if (len > 0.15) {
          const reachStrength = this.leftAimDirective.lockedOn || this.rightAimDirective.lockedOn ? 0.085 : 0.055;
          reachLeanX = (_reachBiasDir.x / len) * reachStrength;
          reachLeanZ = (_reachBiasDir.z / len) * reachStrength;
        }
      }
    }

    // Blend subtle push/pull torso lean & heavy-effort wobble cleanly into existing PD upright target
    let pushPullLeanX = this.interactionLeanX;
    let pushPullLeanZ = this.interactionLeanZ;
    if (this.grounded && this.interactionWobbleAmp > 0.001) {
      this.interactionWobblePhase += dt * 11.5;
      const wobble = Math.sin(this.interactionWobblePhase) * this.interactionWobbleAmp;
      pushPullLeanX += rightX * wobble;
      pushPullLeanZ += rightZ * wobble;
    }

    _targetUp.set(
      this.desiredFacingDir.x * leanAmount + rightX * waddleRoll + reachLeanX + pushPullLeanX,
      1.0,
      this.desiredFacingDir.z * leanAmount + rightZ * waddleRoll + reachLeanZ + pushPullLeanZ,
    );
    _targetUp.normalize();

    this.body.quaternion.vmult(_upWorld, _localUp);
    _localUp.cross(_targetUp, _torqueAxis);

    // Calibrated against body pitch/roll inertia (~2.8 kg*m^2) and gravity lever torque (~57 N*m)
    // so the character leans playfully and wobbles on impact without collapsing onto the floor.
    // During stumbles, nudges, or fast falls, smoothly increase ragdollBlend so physics takes priority
    // before gradually ramping upright stabilization back during recovery (zero snapping).
    const uprightDot = _localUp.dot(_upWorld);
    const isSuspended = isHanging && !this.grounded;
    const fallFlailBlend =
      !this.grounded && !isHanging && this.body.velocity.y < -5.2
        ? THREE.MathUtils.clamp((-this.body.velocity.y - 5.2) / 6.5, 0, 0.85)
        : 0;
    const stumbleTarget = this.stumbleTimer > 0 ? THREE.MathUtils.clamp(this.stumbleTimer * 1.45, 0.25, 0.78) : 0;
    const tiltRagdoll = uprightDot < 0.72 ? THREE.MathUtils.clamp((0.72 - uprightDot) * 1.6, 0, 0.55) : 0;
    const targetRagdoll = Math.max(fallFlailBlend, stumbleTarget, tiltRagdoll);
    this.ragdollBlend = THREE.MathUtils.damp(
      this.ragdollBlend,
      targetRagdoll,
      targetRagdoll > this.ragdollBlend ? 12 : 4.2,
      dt,
    );

    // Trigger sliding / rolling surface friction audio when skidding or tumbling across ground
    if (this.grounded && !isHanging) {
      const isRolling = uprightDot < 0.84 && horizSpeed > 1.3;
      const isSliding =
        !isRolling &&
        ((!hasMoveInput && horizSpeed > 2.3) || (this.nudgeGraceTimer > 0 && horizSpeed > 1.8));
      if (isRolling || isSliding) {
        this.audio.playSlideOrRoll(horizSpeed, isRolling);
      }
    }

    const recoveryBoost = uprightDot < 0.78 && this.stumbleTimer <= 0 ? 1.55 : 1.0;
    const ragdollTorqueFactor = 1 - this.ragdollBlend * 0.58;
    const baseStiffness = isSuspended
      ? this.hangingState.isClimbing
        ? 155
        : this.hangingState.handCount >= 2
          ? 135
          : 105
      : this.grounded
        ? 245
        : 120;
    const uprightStiffness = baseStiffness * recoveryBoost * ragdollTorqueFactor;
    const uprightDamping = (isSuspended ? 19.5 : this.grounded ? 34.0 : 15.0) * (1 - this.ragdollBlend * 0.35);

    const tx = THREE.MathUtils.clamp(
      _torqueAxis.x * uprightStiffness - this.body.angularVelocity.x * uprightDamping,
      -260,
      260,
    );
    const tz = THREE.MathUtils.clamp(
      _torqueAxis.z * uprightStiffness - this.body.angularVelocity.z * uprightDamping,
      -260,
      260,
    );
    this.body.torque.x += tx;
    this.body.torque.z += tz;

    // Smooth yaw torque aligning character's -Z face toward desiredFacingDir (calibrated to yaw inertia ~0.30 kg*m^2)
    this.body.quaternion.vmult(_localForwardRef, _worldForward);
    const fLen = Math.hypot(_worldForward.x, _worldForward.z);
    let yawError = 0;
    if (fLen > 0.05) {
      const cfx = _worldForward.x / fLen;
      const cfz = _worldForward.z / fLen;
      const crossY = cfz * this.desiredFacingDir.x - cfx * this.desiredFacingDir.z;
      const dot = cfx * this.desiredFacingDir.x + cfz * this.desiredFacingDir.z;
      yawError = Math.atan2(crossY, dot);
    }
    this.lastYawError = yawError;

    const yawStiffness = isHanging
      ? this.hangingState.handCount >= 2
        ? 18
        : 11
      : hasMoveInput
        ? this.grounded
          ? 20
          : 8
        : 9;
    const yawDamping = isSuspended ? 3.2 : this.grounded ? 4.4 : 2.5;
    const ty = THREE.MathUtils.clamp(
      yawError * yawStiffness - this.body.angularVelocity.y * yawDamping,
      -28,
      28,
    );
    this.body.torque.y += ty;

    // Safety net: if the character falls below the level void threshold, respawn at active checkpoint
    if (this.body.position.y < this.fallResetY) {
      if (this.onFallOutOfBounds) {
        this.onFallOutOfBounds();
      } else {
        this.dropFromSky();
      }
    }

    // 7. Feed linear acceleration into secondary limb & head inertia springs
    _velCurr.set(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z);
    _accelWorld.copy(_velCurr).sub(this.prevBodyVel).divideScalar(Math.max(dt, 0.001));
    this.prevBodyVel.copy(_velCurr);

    _invQuat
      .set(
        this.body.quaternion.x,
        this.body.quaternion.y,
        this.body.quaternion.z,
        this.body.quaternion.w,
      )
      .invert();
    _accelLocal.copy(_accelWorld).applyQuaternion(_invQuat);

    const accelClampX = THREE.MathUtils.clamp(_accelLocal.x, -16, 16);
    const accelClampZ = THREE.MathUtils.clamp(_accelLocal.z, -16, 16);
    this.headPitchSpring.velocity -= accelClampZ * 0.036;
    this.headRollSpring.velocity += accelClampX * 0.034;
    this.leftArmPitch.velocity += accelClampZ * 0.052;
    this.rightArmPitch.velocity += accelClampZ * 0.052;
    this.leftArmRoll.velocity += accelClampX * 0.032;
    this.rightArmRoll.velocity += accelClampX * 0.032;
  }

  public syncVisualFromBody(dt: number, elapsedSeconds: number): void {
    const safeDt = Math.min(dt, 0.05);

    // Copy rigid-body world transform to visual root
    this.root.position.set(this.body.position.x, this.body.position.y, this.body.position.z);
    this.root.quaternion.set(
      this.body.quaternion.x,
      this.body.quaternion.y,
      this.body.quaternion.z,
      this.body.quaternion.w,
    );

    const horizSpeed = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    const targetMoveIntensity = this.grounded
      ? THREE.MathUtils.clamp(horizSpeed / WALK_SPEED, 0, 1.75)
      : 0;
    this.moveIntensity = THREE.MathUtils.damp(this.moveIntensity, targetMoveIntensity, 10, safeDt);

    // Advance rhythmic stride cycle & emit soft footsteps on stride beats
    if (this.grounded && horizSpeed > 0.35) {
      const prevSin = Math.sin(this.stridePhase);
      const cadence = 1.95 + this.runBlend * 0.35;
      this.stridePhase += horizSpeed * cadence * safeDt;
      const currSin = Math.sin(this.stridePhase);
      if (horizSpeed > 0.8 && ((prevSin < 0 && currSin >= 0) || (prevSin > 0 && currSin <= 0))) {
        this.audio.playFootstep(this.runBlend > 0.45);
      }
    }

    // Smoothly transition hanging posture blend (0 = standing/airborne, 1 = suspended by arms)
    const isSuspendedVisual = this.hangingState.isHanging && !this.grounded;
    this.hangBlend = THREE.MathUtils.damp(this.hangBlend, isSuspendedVisual ? 1 : 0, 10, safeDt);
    if (this.hangingState.isHanging && Math.abs(this.hangingState.shimmySpeed) > 0.12) {
      this.shimmyPhase += Math.abs(this.hangingState.shimmySpeed) * 4.4 * safeDt;
    }

    // Update continuous falling wind swoosh based on actual downward speed
    const downwardSpeed = !this.grounded && !this.hangingState.isHanging ? Math.max(0, -this.body.velocity.y) : 0;
    this.audio.updateFallingWind(downwardSpeed);

    // Step squash & stretch spring (anticipation crouch + landing/recovery brace + stride bounce + hanging stretch + heavy carry load)
    const crouchTarget = this.jumpAnticipationTimer > 0 ? -0.16 : 0;
    const recoveryCrouch = this.recoveryTimer > 0 ? -Math.min(0.12, this.recoveryTimer * 0.22) : 0;
    const carryLoadSquash =
      this.interactionPose.mode === 'carry' && this.grounded
        ? -Math.min(0.085, this.interactionPose.strain * 0.08)
        : 0;
    const strideBounce =
      this.grounded && this.moveIntensity > 0.1
        ? Math.abs(Math.sin(this.stridePhase)) * (0.035 + this.runBlend * 0.025) * Math.min(1, this.moveIntensity)
        : 0;
    const hangStretch =
      this.hangBlend *
      (this.hangingState.isClimbing ? 0.03 : 0.085 * THREE.MathUtils.clamp(this.hangingState.stretchAmount, 0.3, 1.2));

    const squash = THREE.MathUtils.clamp(
      stepSpring(
        this.squashSpring,
        crouchTarget + recoveryCrouch + carryLoadSquash + strideBounce + hangStretch,
        145,
        11.5,
        safeDt,
      ),
      -0.25,
      0.21,
    );
    this.lastSquashValue = squash;
    const scaleY = 1 + squash;
    const scaleXZ = 1 - squash * 0.44;
    this.bodyVisual.scale.set(scaleXZ, scaleY, scaleXZ);
    this.bodyVisual.position.y = (scaleY - 1) * BODY_HALF_HEIGHT;

    const idleBreath = Math.sin(elapsedSeconds * 2.3) * 0.034;
    const airborneFactor = this.grounded ? 0 : 1;
    const fallSpeed = THREE.MathUtils.clamp(-this.body.velocity.y / 9, -0.45, 1.25);
    const fastFallIntensity =
      airborneFactor *
      THREE.MathUtils.clamp((this.airTime - 0.28) / 0.45, 0, 1) *
      THREE.MathUtils.clamp((downwardSpeed - 3.2) / 7.5, 0, 1);
    const strideSin = Math.sin(this.stridePhase);
    const strideCos = Math.cos(this.stridePhase);
    const strideAmp = Math.min(1.45, this.moveIntensity);

    // Expressive effort modifiers from pushing, pulling, heavy carrying, stumbling & throwing
    const pushFactor = this.interactionPose.mode === 'push' ? 1 : 0;
    const pullFactor = this.interactionPose.mode === 'pull' ? 1 : 0;
    const strainShiver =
      this.interactionPose.strain > 0.25
        ? Math.sin(elapsedSeconds * 22) * this.interactionPose.strain * 0.045
        : 0;
    const throwYawKick =
      this.throwRecoilTimer > 0
        ? this.throwRecoilSide * (this.throwRecoilTimer / 0.26) * 0.36
        : 0;

    // --- HEAD (bobs softly with steps, nods into effort/stops, lags on falls & stumbles) ---
    const targetHeadPitch =
      idleBreath * 0.8 +
      airborneFactor * (0.14 - fallSpeed * 0.24) +
      Math.abs(strideSin) * 0.06 * Math.min(1, strideAmp) -
      this.runBlend * 0.08 +
      pushFactor * 0.16 -
      pullFactor * 0.14 +
      this.ragdollBlend * Math.sin(elapsedSeconds * 8.5) * 0.18;
    const targetHeadRoll =
      Math.sin(elapsedSeconds * 1.4) * 0.025 -
      strideSin * 0.055 * Math.min(1, strideAmp) +
      strainShiver +
      this.ragdollBlend * Math.cos(elapsedSeconds * 7.2) * 0.22;
    const targetHeadYaw = THREE.MathUtils.clamp(
      this.lastYawError * 0.32 + throwYawKick,
      -0.52,
      0.52,
    );

    const headStiff = THREE.MathUtils.lerp(88, 42, this.ragdollBlend);
    const headDamp = THREE.MathUtils.lerp(7.6, 4.4, this.ragdollBlend);
    const hPitch = THREE.MathUtils.clamp(
      stepSpring(this.headPitchSpring, targetHeadPitch, headStiff, headDamp, safeDt),
      -0.54,
      0.54,
    );
    const hRoll = THREE.MathUtils.clamp(
      stepSpring(this.headRollSpring, targetHeadRoll, headStiff * 0.9, headDamp, safeDt),
      -0.52,
      0.52,
    );
    const hYaw = THREE.MathUtils.clamp(
      stepSpring(this.headYawSpring, targetHeadYaw, 72, 8.0, safeDt),
      -0.54,
      0.54,
    );
    this.headPivot.rotation.set(hPitch, hYaw, hRoll);

    // --- ARMS (counter-swing with stride, windmill flail while falling, balance flare while stumbling) ---
    const runArmFlare = this.runBlend * 0.24 * Math.min(1, strideAmp);
    const stumbleArmFlare = this.ragdollBlend * 0.48 + (this.recoveryTimer > 0 ? 0.22 : 0);
    const targetArmRoll =
      0.16 +
      runArmFlare +
      stumbleArmFlare +
      airborneFactor * (0.62 + fallSpeed * 0.42);
    const walkArmSwing = -strideSin * 0.62 * strideAmp;
    const flailRate = 10.5 + fastFallIntensity * 6.5;
    const flailAmp = 0.24 + fastFallIntensity * 0.56 + this.ragdollBlend * 0.25;
    const airArmPitch = airborneFactor * (-0.38 - fastFallIntensity * 0.45 + Math.sin(elapsedSeconds * flailRate) * flailAmp);
    const stumbleArmWave = this.grounded ? this.ragdollBlend * Math.sin(elapsedSeconds * 11.0) * 0.42 : 0;

    const armStiff = THREE.MathUtils.lerp(74, 40, this.ragdollBlend);
    const armDamp = THREE.MathUtils.lerp(6.4, 3.8, this.ragdollBlend);

    const lArmP = THREE.MathUtils.clamp(
      stepSpring(
        this.leftArmPitch,
        this.grounded ? walkArmSwing + idleBreath + stumbleArmWave : airArmPitch,
        armStiff,
        armDamp,
        safeDt,
      ),
      -1.55,
      1.55,
    );
    const rArmP = THREE.MathUtils.clamp(
      stepSpring(
        this.rightArmPitch,
        this.grounded ? -walkArmSwing - idleBreath - stumbleArmWave : -airArmPitch * 0.85,
        armStiff,
        armDamp,
        safeDt,
      ),
      -1.55,
      1.55,
    );
    const lArmR = THREE.MathUtils.clamp(
      stepSpring(this.leftArmRoll, targetArmRoll, 66, 6.2, safeDt),
      0.06,
      1.52,
    );
    const rArmR = THREE.MathUtils.clamp(
      stepSpring(this.rightArmRoll, -targetArmRoll, 66, 6.2, safeDt),
      -1.52,
      -0.06,
    );

    this.leftArmPivot.rotation.set(lArmP, 0, -lArmR);
    this.rightArmPivot.rotation.set(rArmP, 0, -rArmR);

    const baseElbowBend =
      -0.2 -
      this.runBlend * 0.42 * Math.min(1, strideAmp) -
      airborneFactor * 0.3;

    // Smoothly blend independent left/right hand aiming over the procedural arm springs
    this.leftAimBlend = THREE.MathUtils.damp(
      this.leftAimBlend,
      this.leftAimDirective.active ? 1 : 0,
      14,
      safeDt,
    );
    this.rightAimBlend = THREE.MathUtils.damp(
      this.rightAimBlend,
      this.rightAimDirective.active ? 1 : 0,
      14,
      safeDt,
    );

    // Ensure world matrices of root & bodyVisual are current before local-space arm aiming
    this.root.updateMatrixWorld(true);

    const applyHandAim = (
      side: -1 | 1,
      shoulderPivot: THREE.Group,
      forearmPivot: THREE.Group,
      directive: HandAimDirective,
      blend: number,
      ringMesh: THREE.Mesh | null,
      ringMat: THREE.MeshBasicMaterial | null,
    ) => {
      let elbow = baseElbowBend;
      if (blend > 0.005) {
        _localAimPoint.copy(directive.worldTarget);
        this.bodyVisual.worldToLocal(_localAimPoint);
        _localAimDir.copy(_localAimPoint).sub(shoulderPivot.position);

        const lenSq = _localAimDir.lengthSq();
        if (lenSq > 0.0001) {
          _localAimDir.divideScalar(Math.sqrt(lenSq));

          // Keep reach within a natural forward/lateral shoulder cone (allow full overhead extension while hanging)
          const zBackLimit = this.hangingState.isHanging && _localAimDir.y > 0.25 ? 0.65 : 0.35;
          if (_localAimDir.z > zBackLimit) {
            _localAimDir.z = zBackLimit;
            _localAimDir.normalize();
          }
          // Subtle anatomical bias so left/right hands stay slightly clear of torso centerline
          if (side === -1 && _localAimDir.x > 0.45) {
            _localAimDir.x = 0.45;
            _localAimDir.normalize();
          } else if (side === 1 && _localAimDir.x < -0.45) {
            _localAimDir.x = -0.45;
            _localAimDir.normalize();
          }

          _baseArmQuat.copy(shoulderPivot.quaternion);
          _aimArmQuat.setFromUnitVectors(_armRestDown, _localAimDir);
          shoulderPivot.quaternion.copy(_baseArmQuat).slerp(_aimArmQuat, blend);

          const aimElbow = this.hangingState.isHanging
            ? this.hangingState.isClimbing
              ? -0.46
              : -0.06
            : directive.lockedOn
              ? -0.18
              : -0.06;
          elbow = THREE.MathUtils.lerp(baseElbowBend, aimElbow, blend);
        }
      }
      forearmPivot.rotation.set(elbow, 0, 0);

      // Update wrist cuff visual feedback ring
      if (ringMesh && ringMat) {
        const showRing = blend > 0.08;
        ringMesh.visible = showRing;
        if (showRing) {
          const pulse = directive.lockedOn ? 1 + Math.sin(elapsedSeconds * 8) * 0.08 : 0.92;
          ringMesh.scale.setScalar(pulse);
          ringMat.opacity = directive.lockedOn ? 0.92 * blend : 0.36 * blend;
          ringMat.color.setHex(
            directive.lockedOn
              ? side === -1
                ? 0x2563eb
                : 0xea580c
              : 0x94a3b8,
          );
        }
      }
    };

    applyHandAim(
      -1,
      this.leftArmPivot,
      this.leftForearmPivot,
      this.leftAimDirective,
      this.leftAimBlend,
      this.leftHandRingMesh,
      this.leftHandRingMat,
    );
    applyHandAim(
      1,
      this.rightArmPivot,
      this.rightForearmPivot,
      this.rightAimDirective,
      this.rightAimBlend,
      this.rightHandRingMesh,
      this.rightHandRingMat,
    );

    // --- LEGS & KNEES (bouncy alternating stride, braced carry/push/pull knees, fast-fall kick, recovery crouch, hanging dangle) ---
    const walkLegSwing = strideSin * 0.64 * strideAmp;
    const effortBrace =
      (this.recoveryTimer > 0 ? Math.min(0.28, this.recoveryTimer * 0.55) : 0) +
      (this.interactionPose.mode !== 'none' && this.grounded
        ? 0.12 + this.interactionPose.strain * 0.18
        : 0);
    const crouchBend = (this.jumpAnticipationTimer > 0 ? 0.36 : 0) + effortBrace;
    const kickFreq = 9.2 + fastFallIntensity * 5.2;
    const airLegSwing = airborneFactor * (0.28 + Math.sin(elapsedSeconds * kickFreq) * (0.18 + fastFallIntensity * 0.34));

    let targetLeftHip = this.grounded
      ? walkLegSwing - crouchBend * 0.65
      : airLegSwing - 0.16;
    let targetRightHip = this.grounded
      ? -walkLegSwing - crouchBend * 0.65
      : -airLegSwing * 0.75 - 0.16;

    // Bend knee as leg lifts forward or back during stride & during jump crouch/air tuck/brace
    let targetLeftKnee = this.grounded
      ? Math.max(0, -strideCos) * 0.55 * Math.min(1.2, strideAmp) + crouchBend * 1.15
      : 0.38 + Math.max(0, -fallSpeed) * 0.25 + fastFallIntensity * 0.26;
    let targetRightKnee = this.grounded
      ? Math.max(0, strideCos) * 0.55 * Math.min(1.2, strideAmp) + crouchBend * 1.15
      : 0.32 + Math.max(0, -fallSpeed) * 0.25 + fastFallIntensity * 0.26;

    let legRollSpread = 0.03 + effortBrace * 0.24 + this.ragdollBlend * 0.08;
    if (this.hangBlend > 0.005) {
      const climbTuck = this.hangingState.isClimbing ? 0.42 : 0;
      const dangleSway = Math.sin(elapsedSeconds * 3.1) * 0.14;
      const velSway = THREE.MathUtils.clamp(-this.body.velocity.y * 0.08, -0.22, 0.24);
      const shimmyKick =
        Math.sin(this.shimmyPhase) *
        THREE.MathUtils.clamp(Math.abs(this.hangingState.shimmySpeed) * 0.18, 0, 0.32);

      const hangLeftHip = 0.08 + dangleSway + velSway - climbTuck * 0.75 + shimmyKick;
      const hangRightHip = 0.08 - dangleSway * 0.85 + velSway - climbTuck * 0.55 - shimmyKick;
      const hangLeftKnee = 0.24 + Math.max(0, dangleSway) * 0.45 + climbTuck * 1.05;
      const hangRightKnee = 0.26 + Math.max(0, -dangleSway) * 0.45 + climbTuck * 0.85;

      targetLeftHip = THREE.MathUtils.lerp(targetLeftHip, hangLeftHip, this.hangBlend);
      targetRightHip = THREE.MathUtils.lerp(targetRightHip, hangRightHip, this.hangBlend);
      targetLeftKnee = THREE.MathUtils.lerp(targetLeftKnee, hangLeftKnee, this.hangBlend);
      targetRightKnee = THREE.MathUtils.lerp(targetRightKnee, hangRightKnee, this.hangBlend);

      const lateralSwayRoll = THREE.MathUtils.clamp(
        this.hangingState.shimmySpeed * 0.09 + Math.sin(elapsedSeconds * 2.4) * 0.05,
        -0.18,
        0.18,
      );
      legRollSpread = THREE.MathUtils.lerp(0.03, 0.06 + lateralSwayRoll, this.hangBlend);
    }

    const legStiffness = THREE.MathUtils.lerp(88, 42, this.hangBlend);
    const legDamping = THREE.MathUtils.lerp(7.6, 4.4, this.hangBlend);
    const lLegP = THREE.MathUtils.clamp(
      stepSpring(this.leftLegPitch, targetLeftHip, legStiffness, legDamping, safeDt),
      -0.95,
      0.95,
    );
    const rLegP = THREE.MathUtils.clamp(
      stepSpring(this.rightLegPitch, targetRightHip, legStiffness, legDamping, safeDt),
      -0.95,
      0.95,
    );
    const lKneeP = THREE.MathUtils.clamp(
      stepSpring(this.leftKneePitch, targetLeftKnee, 95, 8.2, safeDt),
      0,
      1.15,
    );
    const rKneeP = THREE.MathUtils.clamp(
      stepSpring(this.rightKneePitch, targetRightKnee, 95, 8.2, safeDt),
      0,
      1.15,
    );

    this.leftLegPivot.rotation.set(lLegP, 0, legRollSpread);
    this.rightLegPivot.rotation.set(rLegP, 0, -legRollSpread);
    this.leftShinPivot.rotation.set(lKneeP, 0, 0);
    this.rightShinPivot.rotation.set(rKneeP, 0, 0);

    // Update grounded radial contact shadow size & opacity onto the surface directly underneath
    const altitude = Math.max(0, this.body.position.y - BODY_HALF_HEIGHT - this.groundSurfaceY);
    const shadowScale = THREE.MathUtils.clamp(1 - altitude * 0.1, 0.35, 1.0);
    const shadowOpacity = THREE.MathUtils.clamp(0.46 * (1 - altitude * 0.14), 0.06, 0.46);
    this.contactShadowMesh.position.set(
      this.body.position.x,
      this.groundSurfaceY + 0.03,
      this.body.position.z,
    );
    this.contactShadowMesh.scale.setScalar(shadowScale);
    (this.contactShadowMesh.material as THREE.MeshBasicMaterial).opacity = shadowOpacity;
  }

  public setSpawnPoint(pos: [number, number, number]): void {
    this.spawnPosition.set(pos[0], pos[1], pos[2]);
  }

  public setFallResetY(y: number): void {
    this.fallResetY = y;
  }

  public setOnFallOutOfBounds(cb?: () => void): void {
    this.onFallOutOfBounds = cb;
  }

  public setOnHeavyImpact(cb?: (x: number, y: number, z: number, intensity: number) => void): void {
    this.onHeavyImpact = cb;
  }

  public respawnAt(pos: [number, number, number], facingYaw = 0): void {
    this.body.position.set(pos[0], pos[1], pos[2]);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.quaternion.setFromEuler(0, facingYaw, 0);
    this.desiredFacingDir.set(-Math.sin(facingYaw), 0, -Math.cos(facingYaw)).normalize();
    this.prevBodyVel.set(0, 0, 0);
    this.jumpAnticipationTimer = 0;
    this.jumpCooldown = 0;
    this.coyoteTimer = 0;
    this.stumbleTimer = 0;
    this.recoveryTimer = 0;
    this.ragdollBlend = 0;
    this.airTime = 0;
    this.throwRecoilTimer = 0;
    this.standingBody = null;
    this.audio.updateFallingWind(0);
    this.body.wakeUp();
    this.syncVisualFromBody(0.016, 0);
  }

  public dropFromSky(): void {
    this.body.position.set(this.spawnPosition.x, this.spawnPosition.y, this.spawnPosition.z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(
      (Math.random() - 0.5) * 0.5,
      0,
      (Math.random() - 0.5) * 0.5,
    );
    this.body.quaternion.setFromEuler(0, 0, 0);
    this.desiredFacingDir.set(0, 0, -1);
    this.prevBodyVel.set(0, 0, 0);
    this.jumpAnticipationTimer = 0;
    this.jumpCooldown = 0;
    this.stumbleTimer = 0;
    this.recoveryTimer = 0;
    this.standingBody = null;
    this.body.wakeUp();
    this.leftArmRoll.velocity += 2.2;
    this.rightArmRoll.velocity -= 2.2;
  }

  public applyNudge(forwardXZ: THREE.Vector3): void {
    _nudgeDir.copy(forwardXZ);
    _nudgeDir.y = 0;
    if (_nudgeDir.lengthSq() < 0.0001) {
      _nudgeDir.set(0.6, 0, -0.8);
    }
    _nudgeDir.normalize();

    const sideAngle = (Math.random() - 0.5) * 0.45;
    _nudgeDir.applyAxisAngle(_worldUpThree, sideAngle);

    const impulseStrength = 34;
    _impulseVec.set(_nudgeDir.x * impulseStrength, 13.5, _nudgeDir.z * impulseStrength);
    // Relative offset slightly above center of mass creates playful upper-body wobble
    _impulsePoint.set(0, 0.22, 0);
    this.body.applyImpulse(_impulseVec, _impulsePoint);
    this.nudgeGraceTimer = 0.45;
    this.stumbleTimer = Math.max(this.stumbleTimer, 0.42);
    this.recoveryTimer = Math.max(this.recoveryTimer, 0.52);
    this.headPitchSpring.velocity -= 2.4;
    this.leftArmRoll.velocity += 2.6;
    this.rightArmRoll.velocity -= 2.6;
    this.audio.playCharacterCollision(5.2, {
      x: this.body.position.x,
      y: this.body.position.y,
      z: this.body.position.z,
    });
    this.body.wakeUp();
  }

  public triggerThrowRecoil(side: HandSide, throwSpeed: number): void {
    const strength = THREE.MathUtils.clamp(throwSpeed / 7.0, 0.4, 1.35);
    this.throwRecoilTimer = 0.26;
    this.throwRecoilSide = side === 'left' ? -1 : 1;
    if (side === 'left') {
      this.leftArmPitch.velocity -= 4.8 * strength;
      this.leftArmRoll.velocity += 2.0 * strength;
    } else {
      this.rightArmPitch.velocity -= 4.8 * strength;
      this.rightArmRoll.velocity -= 2.0 * strength;
    }
    this.headPitchSpring.velocity -= 1.4 * strength;
    this.squashSpring.velocity += 1.6 * strength;
  }

  public setInteractionPose(pose: CharacterInteractionPose): void {
    this.interactionPose.mode = pose.mode;
    this.interactionPose.heldMass = pose.heldMass;
    this.interactionPose.strain = THREE.MathUtils.clamp(pose.strain, 0, 1);
    this.interactionPose.twoHanded = pose.twoHanded;
  }

  public setHandAimDirective(
    side: HandSide,
    active: boolean,
    lockedOn: boolean,
    worldTarget: THREE.Vector3,
  ): void {
    const directive = side === 'left' ? this.leftAimDirective : this.rightAimDirective;
    directive.active = active;
    directive.lockedOn = lockedOn;
    directive.worldTarget.copy(worldTarget);
  }

  public setInteractionLean(leanX: number, leanZ: number, wobbleAmp: number): void {
    this.interactionLeanX = THREE.MathUtils.clamp(leanX, -0.2, 0.2);
    this.interactionLeanZ = THREE.MathUtils.clamp(leanZ, -0.2, 0.2);
    this.interactionWobbleAmp = THREE.MathUtils.clamp(wobbleAmp, 0, 0.06);
  }

  public setHangingState(state: HangingCharacterState): void {
    this.hangingState.isHanging = state.isHanging;
    this.hangingState.isClimbing = state.isClimbing;
    this.hangingState.handCount = state.handCount;
    this.hangingState.wallNormalX = state.wallNormalX;
    this.hangingState.wallNormalZ = state.wallNormalZ;
    this.hangingState.stretchAmount = state.stretchAmount;
    this.hangingState.shimmySpeed = state.shimmySpeed;
  }

  public getRagdollBlend(): number {
    return this.ragdollBlend;
  }

  public isHanging(): boolean {
    return this.hangingState.isHanging;
  }

  public isGrounded(): boolean {
    return this.grounded;
  }

  public getGroundSurfaceY(): number {
    return this.groundSurfaceY;
  }

  public getShoulderWorldPosition(side: HandSide, out: THREE.Vector3): THREE.Vector3 {
    const pivot = side === 'left' ? this.leftArmPivot : this.rightArmPivot;
    return pivot.getWorldPosition(out);
  }

  public getHandTipWorldPosition(side: HandSide, out: THREE.Vector3): THREE.Vector3 {
    const anchor = side === 'left' ? this.leftHandTipAnchor : this.rightHandTipAnchor;
    return anchor.getWorldPosition(out);
  }

  public getRunRatio(): number {
    return this.runBlend * Math.min(1, this.moveIntensity);
  }

  public getFollowTarget(out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      this.body.position.x,
      this.body.position.y + 0.32,
      this.body.position.z,
    );
  }

  public getArmLocalQuaternion(side: HandSide, out: THREE.Quaternion): THREE.Quaternion {
    const pivot = side === 'left' ? this.leftArmPivot : this.rightArmPivot;
    return out.copy(pivot.quaternion);
  }

  public getElbowPitch(side: HandSide): number {
    const forearm = side === 'left' ? this.leftForearmPivot : this.rightForearmPivot;
    return forearm.rotation.x;
  }

  public getHeadRotation(): [number, number, number] {
    return [this.headPivot.rotation.x, this.headPivot.rotation.y, this.headPivot.rotation.z];
  }

  public getSquashValue(): number {
    return this.lastSquashValue;
  }

  public getStridePhase(): number {
    return this.stridePhase;
  }

  public getInteractionPose(): Readonly<CharacterInteractionPose> {
    return this.interactionPose;
  }

  public getHangingState(): Readonly<HangingCharacterState> {
    return this.hangingState;
  }

  public isRunningActive(): boolean {
    return this.runBlend > 0.35 && this.moveIntensity > 0.15;
  }

  public isJustLanded(): boolean {
    return this.recentLandingTimer > 0;
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
