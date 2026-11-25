import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  EngineMode,
  GameEngineCallbacks,
  GameEngineHandle,
  LevelId,
  LevelRuntimeSnapshot,
  OnlineRoomSyncContext,
} from './types';
import { DEFAULT_GAME_SETTINGS, type GameSettings } from './settings';
import { createProceduralTextures } from './textures';
import { ProceduralAudio } from './audio';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { PlayerCharacter } from './character/PlayerCharacter';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera';
import { KeyboardInput, type MovementInputState } from './input/KeyboardInput';
import { HandTargetingSystem } from './interaction/HandTargetingSystem';
import { HandGrabSystem } from './interaction/HandGrabSystem';
import { LedgeClimbSystem } from './interaction/LedgeClimbSystem';
import { LevelManager } from './levels/LevelManager';
import { ParticleEffects } from './vfx/ParticleEffects';
import { RemotePlayerManager } from './network/RemotePlayerManager';
import { NetworkedPhysicsManager } from './network/NetworkedPhysicsManager';
import {
  computeSpawnPositionForSlot,
  type CharacterLocomotionState,
  type CharacterSyncPayload,
  type CoopObjectForcePayload,
  type ObjectOwnershipRecord,
  type PhysicsObjectSyncState,
  type PuzzleSyncSnapshot,
  type SyncedHandMode,
  type SyncedHandState,
  type SyncedTargetKind,
} from './network/protocol';

// Pre-allocated scratch vectors (zero GC in render loop)
const _followTarget = new THREE.Vector3();
const _playerWorldPos = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camLookDir = new THREE.Vector3();
const _moveDirWorld = new THREE.Vector3();
const _menuWaveTargetL = new THREE.Vector3();
const _menuWaveTargetR = new THREE.Vector3();
const _menuNudgeDir = new THREE.Vector3();
const _syncLeftTip = new THREE.Vector3();
const _syncRightTip = new THREE.Vector3();
const _syncLeftArmQuat = new THREE.Quaternion();
const _syncRightArmQuat = new THREE.Quaternion();
const _inputState: MovementInputState = {
  forward: 0,
  right: 0,
  run: false,
  jumpBuffered: false,
  jumpHeld: false,
};
const EMPTY_REMOTE_POSITIONS: THREE.Vector3[] = [];

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function createGameEngine(
  mountContainer: HTMLElement,
  callbacks: GameEngineCallbacks,
  initialSettings: GameSettings = DEFAULT_GAME_SETTINGS,
): GameEngineHandle | null {
  const isSoftwareGl = detectSoftwareWebGL();
  let activeSettings: GameSettings = initialSettings;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl && activeSettings.graphics.antialias,
      powerPreference: 'high-performance',
    });
  } catch {
    callbacks.onWebGLError('WebGL could not be initialized in this browser.');
    return null;
  }

  const width = Math.max(1, mountContainer.clientWidth || window.innerWidth);
  const height = Math.max(1, mountContainer.clientHeight || window.innerHeight);

  const computePixelRatio = (settings: GameSettings): number => {
    if (isSoftwareGl) return 1;
    const presetCap =
      settings.graphics.qualityPreset === 'low'
        ? 1.0
        : settings.graphics.qualityPreset === 'medium'
          ? 1.5
          : 2.0;
    return Math.min(window.devicePixelRatio * settings.graphics.resolutionScale, presetCap);
  };

  renderer.setSize(width, height);
  renderer.setPixelRatio(computePixelRatio(activeSettings));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = !isSoftwareGl && activeSettings.graphics.shadowsEnabled;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  mountContainer.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd8ebf8);

  // Studio environment reflections (PMREM RoomEnvironment) on every device
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.55;
  roomEnv.dispose();
  pmremGenerator.dispose();

  // Balanced 3-point warm/cool daylight lighting rig (re-themed per level)
  const hemiLight = new THREE.HemisphereLight(0xb2dcff, 0xd4c3ae, 0.92);
  hemiLight.position.set(0, 45, 0);
  scene.add(hemiLight);

  const sunKeyLight = new THREE.DirectionalLight(0xfff3de, 2.05);
  sunKeyLight.position.set(18, 28, 16);
  sunKeyLight.castShadow = !isSoftwareGl && activeSettings.graphics.shadowsEnabled;
  sunKeyLight.shadow.mapSize.width = 2048;
  sunKeyLight.shadow.mapSize.height = 2048;
  sunKeyLight.shadow.camera.near = 2;
  sunKeyLight.shadow.camera.far = 110;
  const shadowExtent = 26;
  sunKeyLight.shadow.camera.left = -shadowExtent;
  sunKeyLight.shadow.camera.right = shadowExtent;
  sunKeyLight.shadow.camera.top = shadowExtent;
  sunKeyLight.shadow.camera.bottom = -shadowExtent;
  sunKeyLight.shadow.bias = -0.0005;
  sunKeyLight.shadow.normalBias = 0.025;
  sunKeyLight.shadow.radius = 2.5;
  scene.add(sunKeyLight);
  scene.add(sunKeyLight.target);

  // Soft cool rim light to sculpt the white humanoid silhouette cleanly
  const rimLight = new THREE.DirectionalLight(0xcbe2ff, 0.55);
  rimLight.position.set(-18, 14, -20);
  scene.add(rimLight);

  // Core game subsystems (Steps 1–6 preserved intact)
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const textures = createProceduralTextures(maxAnisotropy);
  const audio = new ProceduralAudio();
  const physics = new PhysicsWorld();
  const player = new PlayerCharacter(scene, physics, textures, audio);
  const particles = new ParticleEffects(scene);
  const remotePlayers = new RemotePlayerManager(scene, textures, physics);
  const networkedPhysics = new NetworkedPhysicsManager({
    onSendObjectsSync: (levelId, objects) => {
      callbacks.onPhysicsObjectsSync?.(levelId, objects);
    },
    onSendCoopForce: (payload) => {
      callbacks.onCoopObjectForce?.(payload);
    },
  });

  const levelManager = new LevelManager(
    scene,
    { hemiLight, sunKeyLight, rimLight },
    physics,
    textures,
    audio,
    {
      onLevelCompleted: (payload) => {
        cameraRig.exitPointerLock();
        audio.setMusicTheme('victory');
        if (onlineContext) {
          callbacks.onPuzzleFinishReached?.(payload.levelId);
        }
        callbacks.onLevelCompleted?.(payload);
      },
      onRelicCollected: (levelId, relicId, label) => {
        callbacks.onRelicCollected?.(levelId, relicId, label);
      },
      onCheckpointReached: (levelId, index, spawnPos, spawnYaw, label) => {
        if (onlineContext) {
          callbacks.onPuzzleCheckpointReached?.(levelId, index, spawnPos, spawnYaw, label);
        }
      },
      onLeverToggled: (levelId, leverId, isOn, label) => {
        if (onlineContext) {
          callbacks.onPuzzleLeverToggled?.(levelId, leverId, isOn, label);
        }
      },
      onImpactEffect: (x, y, z, intensity, kind) => {
        particles.emitImpact(x, y, z, intensity, kind);
        if (engineMode === 'playing' && intensity > 0.72) {
          const dist = Math.hypot(
            x - player.body.position.x,
            y - player.body.position.y,
            z - player.body.position.z,
          );
          if (dist < 10) {
            cameraRig.addImpactShake((1 - dist / 10) * intensity * 0.45);
          }
        }
      },
    },
  );

  // Load Dream World immediately as the sunlit 3D Main Menu attract-mode backdrop
  const initialLevel = levelManager.loadLevel('dream-world', player.body, []);
  networkedPhysics.bindLevelObjects(initialLevel.levelId, initialLevel.dynamicBlocks);
  audio.setMusicTheme('menu');
  audio.setEnvironmentTheme('menu');

  const cameraRig = new ThirdPersonCamera(
    width / height,
    renderer.domElement,
    initialLevel.cameraColliders,
    callbacks.onPointerLockChange,
    () => audio.unlock(),
  );
  cameraRig.setMinCameraY(initialLevel.minCameraY);

  const keyboard = new KeyboardInput(() => audio.unlock());
  const handTargeting = new HandTargetingSystem(
    scene,
    renderer.domElement,
    cameraRig,
    player,
    physics,
    initialLevel.dynamicBlocks,
    audio,
    callbacks.onHandTargetingChange,
  );
  handTargeting.setInputEnabled(false);
  const handGrab = new HandGrabSystem(handTargeting, player, cameraRig, audio);
  const ledgeClimb = new LedgeClimbSystem(
    handTargeting,
    player,
    physics,
    audio,
    (side) => handGrab.isHolding(side),
  );
  handGrab.setLedgeBusyCheck((side) => ledgeClimb.isGrabbingLedge(side));
  handGrab.setNetworkHooks({
    isRemoteOwnedBlock: (objectId) => networkedPhysics.isRemoteOwned(objectId),
    onBlockGrabbed: (objectId, side, mode) => {
      if (onlineContext) {
        callbacks.onPhysicsGrabClaim?.(objectId, levelManager.getCurrentLevelId(), side, mode);
      }
    },
    onBlockReleased: (objectId, side, releasedWithMomentum) => {
      if (onlineContext) {
        callbacks.onPhysicsGrabRelease?.(
          objectId,
          levelManager.getCurrentLevelId(),
          side,
          releasedWithMomentum,
        );
      }
    },
    onCoopForceAssist: (objectId, side, mode, fx, fy, fz, wx, wy, wz) => {
      if (onlineContext) {
        networkedPhysics.emitCoopForceFromLocalHelper(objectId, side, mode, fx, fy, fz, wx, wy, wz);
      }
    },
  });

  let engineMode: EngineMode = 'menu';
  let interactKeyCode = activeSettings.controls.keyBindings.interact;
  let lastSnapshotKey = '';
  let lastRenderedFrameMs = 0;

  // Step 9.2–9.5: Online multiplayer character, physics & cooperative puzzle sync state
  let onlineContext: OnlineRoomSyncContext | null = null;
  let syncSeq = 0;
  let syncAccumulatorSec = 0;
  let puzzleSyncAccumulatorSec = 0;
  let lastHostPuzzleKey = '';
  let prevRoomPlayerCount = 0;
  let prevLeftGrabbing = false;
  let prevRightGrabbing = false;
  let leftReleaseSeq = 0;
  let rightReleaseSeq = 0;
  let lastSentPosX = 0;
  let lastSentPosY = 0;
  let lastSentPosZ = 0;
  let lastSentDiscreteKey = '';

  const round3 = (n: number): number => Math.round(n * 1000) / 1000;
  const round2 = (n: number): number => Math.round(n * 100) / 100;

  const buildSyncedHand = (
    side: 'left' | 'right',
    tipOut: THREE.Vector3,
    armQuatOut: THREE.Quaternion,
    releaseSeq: number,
  ): SyncedHandState => {
    const heldBlock = handGrab.getHeldState(side);
    const heldLedge = ledgeClimb.getLedgeGrabState(side);
    const targetState = handTargeting.getHandState(side);

    player.getHandTipWorldPosition(side, tipOut);
    player.getArmLocalQuaternion(side, armQuatOut);

    const grabbing = Boolean(heldBlock || heldLedge);
    const mode: SyncedHandMode = heldLedge
      ? heldLedge.mode
      : heldBlock
        ? heldBlock.mode
        : targetState.isAiming
          ? 'aiming'
          : 'idle';

    let targetKind: SyncedTargetKind = 'none';
    let targetId: string | null = null;
    let targetPoint: [number, number, number] | null = null;

    if (heldBlock) {
      targetKind = 'block';
      targetId = heldBlock.block.spec.id;
      targetPoint = [
        round3(heldBlock.worldAnchor.x),
        round3(heldBlock.worldAnchor.y),
        round3(heldBlock.worldAnchor.z),
      ];
    } else if (heldLedge) {
      targetKind = 'ledge';
      targetId = heldLedge.ledgeId;
      targetPoint = [
        round3(heldLedge.worldAnchor.x),
        round3(heldLedge.worldAnchor.y),
        round3(heldLedge.worldAnchor.z),
      ];
    } else if (targetState.isAiming) {
      targetKind = targetState.target?.surfaceKind ?? 'none';
      targetId = targetState.target?.block?.spec.id ?? targetState.target?.ledgeId ?? null;
      targetPoint = [
        round3(targetState.aimWorldPoint.x),
        round3(targetState.aimWorldPoint.y),
        round3(targetState.aimWorldPoint.z),
      ];
    }

    return {
      pos: [round3(tipOut.x), round3(tipOut.y), round3(tipOut.z)],
      armQuat: [
        round3(armQuatOut.x),
        round3(armQuatOut.y),
        round3(armQuatOut.z),
        round3(armQuatOut.w),
      ],
      elbowPitch: round3(player.getElbowPitch(side)),
      aimActive: targetState.isAiming || grabbing,
      grabbing,
      mode,
      targetKind,
      targetId,
      targetPoint,
      releaseSeq,
    };
  };

  const emitLocalCharacterStateIfNeeded = (dt: number, force = false): void => {
    if (!onlineContext || !callbacks.onLocalCharacterState) return;

    const leftGrabbing = handGrab.isHolding('left') || ledgeClimb.isGrabbingLedge('left');
    const rightGrabbing = handGrab.isHolding('right') || ledgeClimb.isGrabbingLedge('right');
    if (prevLeftGrabbing && !leftGrabbing) leftReleaseSeq += 1;
    if (prevRightGrabbing && !rightGrabbing) rightReleaseSeq += 1;
    prevLeftGrabbing = leftGrabbing;
    prevRightGrabbing = rightGrabbing;

    const grounded = player.isGrounded();
    const hangingState = player.getHangingState();
    const ragdoll = player.getRagdollBlend();
    const running = player.isRunningActive();
    const justLanded = player.isJustLanded();
    const horizSpeed = Math.hypot(player.body.velocity.x, player.body.velocity.z);
    const vy = player.body.velocity.y;

    let locomotion: CharacterLocomotionState = 'idle';
    if (hangingState.isClimbing) {
      locomotion = 'climb';
    } else if (hangingState.isHanging) {
      locomotion = 'hang';
    } else if (ragdoll > 0.42) {
      locomotion = 'ragdoll';
    } else if (!grounded) {
      locomotion = vy > 0.8 ? 'jump' : 'fall';
    } else if (justLanded) {
      locomotion = 'land';
    } else if (running) {
      locomotion = 'run';
    } else if (horizSpeed > 0.35) {
      locomotion = 'walk';
    }

    const discreteKey = `${locomotion}|${leftGrabbing ? 1 : 0}|${rightGrabbing ? 1 : 0}|${leftReleaseSeq}|${rightReleaseSeq}`;
    const movedDistSq =
      (player.body.position.x - lastSentPosX) ** 2 +
      (player.body.position.y - lastSentPosY) ** 2 +
      (player.body.position.z - lastSentPosZ) ** 2;
    const isActive =
      movedDistSq > 0.0004 ||
      horizSpeed > 0.08 ||
      Math.abs(vy) > 0.08 ||
      leftGrabbing ||
      rightGrabbing ||
      handTargeting.isHandInputHeld('left') ||
      handTargeting.isHandInputHeld('right') ||
      ragdoll > 0.08;

    syncAccumulatorSec += dt;
    const minIntervalSec = isActive ? 0.05 : 0.25; // 20 Hz active, 4 Hz idle heartbeat
    if (!force && discreteKey === lastSentDiscreteKey && syncAccumulatorSec < minIntervalSec) {
      return;
    }

    syncAccumulatorSec = 0;
    lastSentDiscreteKey = discreteKey;
    lastSentPosX = player.body.position.x;
    lastSentPosY = player.body.position.y;
    lastSentPosZ = player.body.position.z;
    syncSeq += 1;

    player.root.updateMatrixWorld(true);
    const headRot = player.getHeadRotation();
    const interactionPose = player.getInteractionPose();

    const payload: CharacterSyncPayload = {
      playerId: onlineContext.localPlayerId,
      seq: syncSeq,
      serverTime: Date.now() + onlineContext.serverClockOffsetMs,
      levelId: levelManager.getCurrentLevelId(),
      pos: [
        round3(player.body.position.x),
        round3(player.body.position.y),
        round3(player.body.position.z),
      ],
      vel: [
        round2(player.body.velocity.x),
        round2(player.body.velocity.y),
        round2(player.body.velocity.z),
      ],
      quat: [
        round3(player.body.quaternion.x),
        round3(player.body.quaternion.y),
        round3(player.body.quaternion.z),
        round3(player.body.quaternion.w),
      ],
      angVel: [
        round2(player.body.angularVelocity.x),
        round2(player.body.angularVelocity.y),
        round2(player.body.angularVelocity.z),
      ],
      moveDir: [round2(_moveDirWorld.x), round2(_moveDirWorld.z)],
      locomotion,
      grounded,
      running,
      ragdollBlend: round3(ragdoll),
      squash: round3(player.getSquashValue()),
      groundY: round3(player.getGroundSurfaceY()),
      headRot: [round3(headRot[0]), round3(headRot[1]), round3(headRot[2])],
      stridePhase: round2(player.getStridePhase()),
      hanging: hangingState.isHanging,
      climbing: hangingState.isClimbing,
      shimmySpeed: round2(hangingState.shimmySpeed),
      interactionMode: interactionPose.mode,
      interactionStrain: round2(interactionPose.strain),
      leftHand: buildSyncedHand('left', _syncLeftTip, _syncLeftArmQuat, leftReleaseSeq),
      rightHand: buildSyncedHand('right', _syncRightTip, _syncRightArmQuat, rightReleaseSeq),
    };

    callbacks.onLocalCharacterState(payload);
  };

  // Main Menu funny physics choreography timers
  let menuHopTimer = 1.6;
  let menuNudgeTimer = 4.2;
  let menuJumpQueued = false;

  const applySettingsInternal = (settings: GameSettings): void => {
    activeSettings = settings;

    // 1. Graphics
    renderer.setPixelRatio(computePixelRatio(settings));
    const shadowsOn = !isSoftwareGl && settings.graphics.shadowsEnabled;
    if (renderer.shadowMap.enabled !== shadowsOn) {
      renderer.shadowMap.enabled = shadowsOn;
      renderer.shadowMap.needsUpdate = true;
    }
    sunKeyLight.castShadow = shadowsOn;

    const targetShadowSize =
      settings.graphics.qualityPreset === 'low'
        ? 512
        : settings.graphics.qualityPreset === 'medium'
          ? 1024
          : 2048;
    if (sunKeyLight.shadow.mapSize.width !== targetShadowSize) {
      sunKeyLight.shadow.mapSize.set(targetShadowSize, targetShadowSize);
      sunKeyLight.shadow.map?.dispose();
      sunKeyLight.shadow.map = null;
      renderer.shadowMap.needsUpdate = true;
    }
    scene.environmentIntensity =
      settings.graphics.qualityPreset === 'low'
        ? 0.35
        : settings.graphics.qualityPreset === 'ultra'
          ? 0.65
          : 0.55;

    // 2. Audio (Master, Music, SFX, Environmental Audio & Mute All)
    audio.setVolumes(
      settings.audio.masterVolume,
      settings.audio.musicVolume,
      settings.audio.sfxVolume,
      settings.audio.environmentVolume,
      settings.audio.muted,
    );

    // 3. Controls & Gameplay
    keyboard.setBindings(settings.controls.keyBindings);
    keyboard.setSensitivity(settings.controls.keyboardSensitivity);
    interactKeyCode = settings.controls.keyBindings.interact;
    handTargeting.setKeyBindings(
      settings.controls.keyBindings.leftGrab,
      settings.controls.keyBindings.rightGrab,
    );
    handTargeting.setReachAssist(settings.gameplay.autoMantleAssist);
    cameraRig.applySettings({
      sensitivity: settings.controls.cameraSensitivity,
      invertY: settings.controls.invertMouseY,
      distance: settings.gameplay.cameraDistance,
    });
  };

  applySettingsInternal(activeSettings);

  const syncShadowCameraToPlayer = (): void => {
    const [ox, oy, oz] = levelManager.getSunOffset();
    const px = player.body.position.x;
    const py = player.body.position.y;
    const pz = player.body.position.z;
    sunKeyLight.position.set(px + ox, py + oy, pz + oz);
    sunKeyLight.target.position.set(px, py, pz);
    sunKeyLight.target.updateMatrixWorld();
  };

  const emitLevelSnapshotIfChanged = (force = false): void => {
    if (!callbacks.onLevelStateChange) return;
    const snap: LevelRuntimeSnapshot = levelManager.getSnapshot();
    const key = [
      snap.levelId,
      snap.checkpointIndex,
      snap.relicsFound,
      snap.elapsedSec,
      snap.status,
      snap.nearLeverLabel ?? '',
      snap.toast ? snap.toast.id : 0,
    ].join('|');
    if (force || key !== lastSnapshotKey) {
      lastSnapshotKey = key;
      callbacks.onLevelStateChange(snap);
    }
  };

  const respawnAtLatestCheckpoint = (announce = true): void => {
    handGrab.releaseAll(false);
    ledgeClimb.releaseAll(false);
    const spawn = levelManager.getActiveSpawn();
    const effectiveSpawnPos = onlineContext
      ? computeSpawnPositionForSlot(spawn.pos, spawn.yaw, onlineContext.localSpawnSlot)
      : spawn.pos;
    player.setSpawnPoint(effectiveSpawnPos);
    player.respawnAt(effectiveSpawnPos, spawn.yaw);
    player.getFollowTarget(_followTarget);
    if (engineMode !== 'menu') {
      cameraRig.resetView(
        _followTarget,
        spawn.yaw + 0.25,
        0.34,
        activeSettings.gameplay.cameraDistance,
      );
    }
    syncShadowCameraToPlayer();
    if (announce && engineMode === 'playing') {
      audio.playRespawnWhoosh();
      levelManager.pushToast('Respawned at latest checkpoint', 'respawn');
      emitLevelSnapshotIfChanged(true);
    }
  };

  player.setSpawnPoint(initialLevel.spawnPos);
  player.setFallResetY(initialLevel.fallResetY);
  player.setOnFallOutOfBounds(() => respawnAtLatestCheckpoint(true));
  player.setOnHeavyImpact((x, y, z, intensity) => {
    particles.emitImpact(x, y, z, intensity, 'dust');
    if (engineMode === 'playing') {
      cameraRig.addImpactShake(intensity * 0.62);
    }
  });
  player.respawnAt(initialLevel.spawnPos, initialLevel.spawnYaw);
  player.getFollowTarget(_followTarget);
  particles.setLevelTheme('dream-world', _followTarget);
  cameraRig.updateMenuOrbit(_followTarget, 0.016, 0);
  syncShadowCameraToPlayer();
  emitLevelSnapshotIfChanged(true);

  const loadLevelInternal = (levelId: LevelId, alreadyFoundRelics: string[] = []): void => {
    handGrab.releaseAll(false);
    ledgeClimb.releaseAll(false);
    keyboard.clearInputs();
    cameraRig.exitPointerLock();

    const loaded = levelManager.loadLevel(levelId, player.body, alreadyFoundRelics);
    cameraRig.setColliders(loaded.cameraColliders);
    cameraRig.setMinCameraY(loaded.minCameraY);
    handTargeting.setDynamicBlocks(loaded.dynamicBlocks);
    networkedPhysics.bindLevelObjects(levelId, loaded.dynamicBlocks);
    levelManager.setMultiplayerCoopActive(Boolean(onlineContext && onlineContext.players.length >= 2));

    remotePlayers.setLevelContext(levelId, loaded.spawnPos, loaded.spawnYaw);
    if (onlineContext) {
      remotePlayers.clear();
      remotePlayers.syncRoster(onlineContext.localPlayerId, onlineContext.players);
    }

    const effectiveSpawnPos = onlineContext
      ? computeSpawnPositionForSlot(loaded.spawnPos, loaded.spawnYaw, onlineContext.localSpawnSlot)
      : loaded.spawnPos;
    player.setSpawnPoint(effectiveSpawnPos);
    player.setFallResetY(loaded.fallResetY);
    player.respawnAt(effectiveSpawnPos, loaded.spawnYaw);

    player.getFollowTarget(_followTarget);
    particles.setLevelTheme(levelId, _followTarget);
    audio.setMusicTheme(levelId);
    audio.setEnvironmentTheme(levelId);

    cameraRig.resetView(
      _followTarget,
      loaded.spawnYaw + 0.25,
      loaded.isSandbox ? 0.32 : 0.34,
      activeSettings.gameplay.cameraDistance,
    );
    syncShadowCameraToPlayer();

    if (!isSoftwareGl) {
      renderer.compile(scene, cameraRig.camera);
    }

    lastHostPuzzleKey = '';
    emitLevelSnapshotIfChanged(true);
    emitLocalCharacterStateIfNeeded(0.05, true);
    if (onlineContext?.isHost) {
      const pSnap = levelManager.getPuzzleSyncSnapshot();
      if (pSnap) callbacks.onHostPuzzleState?.(pSnap);
    }
  };

  // Dedicated configurable interact shortcut for flipping nearby puzzle levers
  const handleLeverKeyDown = (event: KeyboardEvent): void => {
    if (engineMode !== 'playing' || event.repeat) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (event.code === interactKeyCode) {
      audio.unlock();
      _playerWorldPos.set(
        player.body.position.x,
        player.body.position.y,
        player.body.position.z,
      );
      if (levelManager.tryToggleNearestLever(_playerWorldPos)) {
        emitLevelSnapshotIfChanged(true);
      }
    }
  };
  window.addEventListener('keydown', handleLeverKeyDown);

  if (!isSoftwareGl) {
    renderer.compile(scene, cameraRig.camera);
  }

  let disposed = false;
  let contextLost = false;
  let frameId = 0;
  let lastTimestamp = performance.now();
  let elapsedSeconds = 0;

  const handleContextLost = (event: Event): void => {
    event.preventDefault();
    contextLost = true;
  };

  const handleContextRestored = (): void => {
    contextLost = false;
    lastTimestamp = performance.now();
    scheduleNextFrame();
  };

  renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

  const handleResize = (): void => {
    if (disposed) return;
    const nextW = Math.max(1, mountContainer.clientWidth || window.innerWidth);
    const nextH = Math.max(1, mountContainer.clientHeight || window.innerHeight);
    cameraRig.setAspect(nextW / nextH);
    renderer.setSize(nextW, nextH);
    renderer.setPixelRatio(computePixelRatio(activeSettings));
  };
  window.addEventListener('resize', handleResize);

  function afterDraw(cb: () => void): void {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        frameId = window.setTimeout(cb, 80);
      }
    };
    frameId = window.setTimeout(poll, 5);
  }

  function scheduleNextFrame(): void {
    if (disposed || contextLost) return;
    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = window.requestAnimationFrame(tick);
    }
  }

  const consumeJump = (): boolean => keyboard.consumeJumpBuffer();
  const consumeMenuJump = (): boolean => {
    if (menuJumpQueued) {
      menuJumpQueued = false;
      return true;
    }
    return false;
  };

  function tick(): void {
    if (disposed || contextLost) return;

    const now = performance.now();

    // Real frame-rate limit pacing (0 = Unlimited)
    const fpsLimit = activeSettings.graphics.fpsLimit;
    if (!isSoftwareGl && fpsLimit > 0) {
      const minIntervalMs = 1000 / fpsLimit;
      if (now - lastRenderedFrameMs < minIntervalMs - 1.5) {
        scheduleNextFrame();
        return;
      }
    }
    lastRenderedFrameMs = now;

    const rawDelta = (now - lastTimestamp) / 1000;
    lastTimestamp = now;
    const dt = Math.min(Math.max(rawDelta, 0.001), 0.1);
    elapsedSeconds += dt;

    if (engineMode === 'playing') {
      // 0. Sample keyboard input & project onto camera-relative horizontal basis
      keyboard.tick(dt);
      keyboard.getState(_inputState);
      cameraRig.getForwardXZ(_camForward);
      cameraRig.getRightXZ(_camRight);

      _moveDirWorld
        .set(0, 0, 0)
        .addScaledVector(_camForward, _inputState.forward)
        .addScaledVector(_camRight, _inputState.right);
      if (_moveDirWorld.lengthSq() > 1) {
        _moveDirWorld.normalize();
      }

      // 1. Fixed-timestep rigid-body physics step
      physics.step(dt, (fixedDt) => {
        const remotePositions = onlineContext
          ? remotePlayers.getRemotePlayerPositions()
          : EMPTY_REMOTE_POSITIONS;
        const isGuestRemoteSim = Boolean(onlineContext && !onlineContext.isHost);
        levelManager.stepPhysics(fixedDt, player.body, remotePositions, isGuestRemoteSim);
        if (onlineContext) {
          networkedPhysics.stepPhysics(fixedDt);
        }
        ledgeClimb.pushHangingStateToPlayer();
        player.applyPreStepForces(
          fixedDt,
          physics.world,
          _moveDirWorld,
          _inputState.run,
          consumeJump,
        );
        handGrab.applyPreStepForces(fixedDt, _moveDirWorld, _inputState.run);
        ledgeClimb.applyPreStepForces(
          fixedDt,
          _moveDirWorld,
          _inputState.run,
          consumeJump,
          _inputState.jumpHeld,
        );
      });

      // 2. Sync dynamic meshes, puzzle visuals & procedural semi-wobbly limbs
      _playerWorldPos.set(
        player.body.position.x,
        player.body.position.y,
        player.body.position.z,
      );
      levelManager.updateVisuals(
        dt,
        elapsedSeconds,
        _playerWorldPos,
        handTargeting.isHandInputHeld('left'),
        handTargeting.isHandInputHeld('right'),
        false,
      );
      player.syncVisualFromBody(dt, elapsedSeconds);
      syncShadowCameraToPlayer();

      // 3. Smooth third-person camera tracking & wall collision avoidance
      player.getFollowTarget(_followTarget);
      cameraRig.update(_followTarget, dt, player.getRunRatio());

      // 3b. Pooled impact/environmental particles & 3D spatial audio listener sync
      particles.update(dt, elapsedSeconds, _playerWorldPos);
      cameraRig.camera.getWorldDirection(_camLookDir);
      audio.updateListener(cameraRig.camera.position, _camLookDir, cameraRig.camera.up);

      // 4. Independent left/right hand raycast targeting, block/ledge grab acquisition & visual feedback
      handTargeting.update(dt, elapsedSeconds);
      handGrab.syncAfterTargeting();
      ledgeClimb.syncAfterTargeting();

      // 4b. Steps 9.2–9.5: Update interpolated remote characters, shared physics & cooperative puzzles
      if (onlineContext) {
        remotePlayers.update(
          dt,
          elapsedSeconds,
          cameraRig.camera.position,
          onlineContext.serverClockOffsetMs,
          onlineContext.jitterMs,
        );
        emitLocalCharacterStateIfNeeded(dt, false);
        networkedPhysics.emitOwnedObjectUpdates(dt, false);

        if (onlineContext.isHost && callbacks.onHostPuzzleState) {
          puzzleSyncAccumulatorSec += dt;
          if (puzzleSyncAccumulatorSec >= 0.16) {
            const pSnap = levelManager.getPuzzleSyncSnapshot();
            if (pSnap) {
              const pKey = JSON.stringify({
                l: pSnap.levers,
                p: pSnap.plates,
                d: pSnap.doors,
                m: pSnap.platforms,
                c: pSnap.checkpointIndex,
                r: pSnap.collectedRelics.length,
                f: pSnap.completed,
              });
              if (pKey !== lastHostPuzzleKey || puzzleSyncAccumulatorSec >= 1.0) {
                puzzleSyncAccumulatorSec = 0;
                lastHostPuzzleKey = pKey;
                callbacks.onHostPuzzleState(pSnap);
              }
            }
          }
        }
      }

      emitLevelSnapshotIfChanged(false);
    } else if (engineMode === 'menu') {
      // === 3D MAIN MENU ATTRACT MODE: Playful autonomous wobbly physics choreography ===
      const spawn = levelManager.getActiveSpawn();
      const targetX = spawn.pos[0] + Math.sin(elapsedSeconds * 0.65) * 2.4;
      const targetZ = spawn.pos[2] - 1.2 + Math.cos(elapsedSeconds * 0.95) * 1.9;
      const dx = targetX - player.body.position.x;
      const dz = targetZ - player.body.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.35) {
        _moveDirWorld.set(dx / dist, 0, dz / dist).multiplyScalar(Math.min(1, dist * 0.65));
      } else {
        _moveDirWorld.set(0, 0, 0);
      }

      menuHopTimer -= dt;
      if (menuHopTimer <= 0) {
        menuJumpQueued = true;
        menuHopTimer = 2.1 + Math.abs(Math.sin(elapsedSeconds * 1.7)) * 1.4;
      }

      menuNudgeTimer -= dt;
      if (menuNudgeTimer <= 0) {
        _menuNudgeDir.set(Math.cos(elapsedSeconds * 1.3), 0, Math.sin(elapsedSeconds * 1.3));
        player.applyNudge(_menuNudgeDir);
        menuNudgeTimer = 4.6 + Math.abs(Math.cos(elapsedSeconds)) * 1.8;
      }

      // Funny alternating overhead arm waves!
      const px = player.body.position.x;
      const py = player.body.position.y;
      const pz = player.body.position.z;
      const wavePhase = Math.sin(elapsedSeconds * 3.8);
      _menuWaveTargetL.set(px - 0.9, py + 1.55 + wavePhase * 0.5, pz + 0.55);
      _menuWaveTargetR.set(px + 0.9, py + 1.55 - wavePhase * 0.5, pz + 0.55);
      player.setHandAimDirective('left', true, false, _menuWaveTargetL);
      player.setHandAimDirective('right', true, false, _menuWaveTargetR);

      physics.step(dt, (fixedDt) => {
        player.applyPreStepForces(
          fixedDt,
          physics.world,
          _moveDirWorld,
          false,
          consumeMenuJump,
        );
      });

      // Safety tether so the menu character never wanders off the sunlit meadow
      const radialDist = Math.hypot(
        player.body.position.x - spawn.pos[0],
        player.body.position.z - spawn.pos[2],
      );
      if (radialDist > 5.5 || player.body.position.y < -4) {
        player.respawnAt(spawn.pos, spawn.yaw);
      }

      _playerWorldPos.set(
        player.body.position.x,
        player.body.position.y,
        player.body.position.z,
      );
      levelManager.updateVisuals(dt, elapsedSeconds, _playerWorldPos, false, false, true);
      player.syncVisualFromBody(dt, elapsedSeconds);
      syncShadowCameraToPlayer();

      player.getFollowTarget(_followTarget);
      cameraRig.updateMenuOrbit(_followTarget, dt, elapsedSeconds);
      particles.update(dt, elapsedSeconds, _playerWorldPos);
      cameraRig.camera.getWorldDirection(_camLookDir);
      audio.updateListener(cameraRig.camera.position, _camLookDir, cameraRig.camera.up);
    } else {
      // === PAUSED MODE: Simulation, physics, timer & inputs completely suspended ===
      // Keep remote multiplayer characters smoothly updated while paused in an online room.
      if (onlineContext) {
        remotePlayers.update(
          dt,
          elapsedSeconds,
          cameraRig.camera.position,
          onlineContext.serverClockOffsetMs,
          onlineContext.jitterMs,
        );
      }
    }

    // 5. Render frame
    renderer.render(scene, cameraRig.camera);

    scheduleNextFrame();
  }

  // Kick off simulation loop
  frameId = window.requestAnimationFrame(tick);

  return {
    loadLevel(levelId: LevelId, alreadyFoundRelics: string[] = []) {
      audio.unlock();
      loadLevelInternal(levelId, alreadyFoundRelics);
    },
    restartLevel() {
      audio.unlock();
      handGrab.releaseAll(false);
      ledgeClimb.releaseAll(false);
      keyboard.clearInputs();
      const spawn = levelManager.restartCurrentLevel();
      networkedPhysics.clearNetworkState();
      const effectiveSpawnPos = onlineContext
        ? computeSpawnPositionForSlot(spawn.pos, spawn.yaw, onlineContext.localSpawnSlot)
        : spawn.pos;
      player.setSpawnPoint(effectiveSpawnPos);
      player.respawnAt(effectiveSpawnPos, spawn.yaw);
      player.getFollowTarget(_followTarget);
      cameraRig.resetView(
        _followTarget,
        spawn.yaw + 0.25,
        0.34,
        activeSettings.gameplay.cameraDistance,
      );
      syncShadowCameraToPlayer();
      audio.setMusicTheme(levelManager.getCurrentLevelId());
      audio.setEnvironmentTheme(levelManager.getCurrentLevelId());
      audio.playRespawnWhoosh();
      lastHostPuzzleKey = '';
      emitLevelSnapshotIfChanged(true);
      emitLocalCharacterStateIfNeeded(0.05, true);
      if (onlineContext?.isHost) {
        networkedPhysics.emitOwnedObjectUpdates(0.05, true);
        const pSnap = levelManager.getPuzzleSyncSnapshot();
        if (pSnap) callbacks.onHostPuzzleState?.(pSnap);
      }
    },
    respawnAtCheckpoint() {
      audio.unlock();
      respawnAtLatestCheckpoint(true);
    },
    setPaused(nextPaused: boolean) {
      this.setMode(nextPaused ? 'paused' : 'playing');
    },
    setMode(nextMode: EngineMode) {
      if (engineMode === nextMode) return;
      const prevMode = engineMode;
      engineMode = nextMode;

      if (nextMode === 'paused') {
        audio.setPaused(true);
        handTargeting.setInputEnabled(false);
        handGrab.releaseAll(false);
        ledgeClimb.releaseAll(false);
        keyboard.clearInputs();
        cameraRig.exitPointerLock();
      } else if (nextMode === 'menu') {
        audio.setPaused(false);
        audio.setMusicTheme('menu');
        audio.setEnvironmentTheme('menu');
        handTargeting.setInputEnabled(false);
        handGrab.releaseAll(false);
        ledgeClimb.releaseAll(false);
        keyboard.clearInputs();
        cameraRig.exitPointerLock();
      } else if (nextMode === 'playing') {
        audio.setPaused(false);
        handTargeting.setInputEnabled(true);
        const curLevel = levelManager.getCurrentLevelId();
        audio.setMusicTheme(curLevel);
        audio.setEnvironmentTheme(curLevel);
        // Clear any menu arm-waving directives when handing control back to the player
        player.setHandAimDirective('left', false, false, _menuWaveTargetL);
        player.setHandAimDirective('right', false, false, _menuWaveTargetR);
        if (prevMode === 'menu') {
          player.getFollowTarget(_followTarget);
          cameraRig.resetView(
            _followTarget,
            0.25,
            0.34,
            activeSettings.gameplay.cameraDistance,
          );
        }
      }
    },
    applySettings(nextSettings: GameSettings) {
      applySettingsInternal(nextSettings);
    },
    playUiSound(kind) {
      if (kind === 'hover') {
        audio.playUiHover();
      } else if (kind === 'click') {
        audio.playUiClick();
      } else if (kind === 'pause') {
        audio.playPauseChime(true);
      } else if (kind === 'resume') {
        audio.playPauseChime(false);
      } else if (kind === 'test') {
        audio.unlock();
        audio.playCheckpointChime();
      }
    },
    getCurrentLevelId() {
      return levelManager.getCurrentLevelId();
    },
    dropCharacterFromSky() {
      audio.unlock();
      handGrab.releaseAll(false);
      ledgeClimb.releaseAll(false);
      player.dropFromSky();
    },
    nudgeCharacter() {
      audio.unlock();
      cameraRig.getForwardXZ(_camForward);
      player.applyNudge(_camForward);
    },
    resetBlocks() {
      audio.unlock();
      handGrab.releaseAll(false);
      levelManager.resetObjects();
      networkedPhysics.clearNetworkState();
      if (onlineContext?.isHost) {
        networkedPhysics.emitOwnedObjectUpdates(0.05, true);
      }
      emitLevelSnapshotIfChanged(true);
    },
    togglePointerLock() {
      cameraRig.togglePointerLock();
    },
    setOnlineSession(context: OnlineRoomSyncContext | null) {
      const prevPlayerId = onlineContext?.localPlayerId ?? null;
      const prevSlot = onlineContext?.localSpawnSlot ?? -1;
      onlineContext = context;

      if (!context) {
        prevRoomPlayerCount = 0;
        player.setPlayerAccentColor(null);
        remotePlayers.clear();
        networkedPhysics.setSession(null, false, 0, 0);
        levelManager.setMultiplayerCoopActive(false);
        return;
      }

      player.setPlayerAccentColor(context.localPlayerColor);
      const spawn = levelManager.getActiveSpawn();
      remotePlayers.setLevelContext(levelManager.getCurrentLevelId(), spawn.pos, spawn.yaw);
      remotePlayers.syncRoster(context.localPlayerId, context.players);
      networkedPhysics.setSession(
        context.localPlayerId,
        context.isHost,
        context.serverClockOffsetMs,
        context.jitterMs,
      );
      levelManager.setMultiplayerCoopActive(context.players.length >= 2);

      // When a new player joins an active host session, push fresh object & puzzle snapshots
      if (context.isHost && context.players.length > prevRoomPlayerCount && engineMode === 'playing') {
        networkedPhysics.emitOwnedObjectUpdates(0.05, true);
        const pSnap = levelManager.getPuzzleSyncSnapshot();
        if (pSnap) callbacks.onHostPuzzleState?.(pSnap);
      }
      prevRoomPlayerCount = context.players.length;

      // On first joining a room into an active level, position cleanly on our assigned spawn slot
      if (prevPlayerId !== context.localPlayerId || prevSlot !== context.localSpawnSlot) {
        if (engineMode === 'playing') {
          const slotPos = computeSpawnPositionForSlot(
            spawn.pos,
            spawn.yaw,
            context.localSpawnSlot,
          );
          player.setSpawnPoint(slotPos);
          player.respawnAt(slotPos, spawn.yaw);
          emitLocalCharacterStateIfNeeded(0.05, true);
        }
      }
    },
    applyRemoteCharacterState(state: CharacterSyncPayload) {
      remotePlayers.applyRemoteState(state);
    },
    applyPhysicsOwnership(record: ObjectOwnershipRecord) {
      networkedPhysics.applyOwnershipRecord(record);
    },
    applyPhysicsObjectsSync(levelId: LevelId, objects: PhysicsObjectSyncState[]) {
      networkedPhysics.applyObjectsSync(levelId, objects);
    },
    applyPhysicsSyncAll(
      levelId: LevelId,
      objects: PhysicsObjectSyncState[],
      ownerships: ObjectOwnershipRecord[],
    ) {
      networkedPhysics.applySyncAll(levelId, objects, ownerships);
    },
    applyCoopObjectForce(payload: CoopObjectForcePayload) {
      networkedPhysics.enqueueCoopForce(payload);
    },
    applyPuzzleState(state: PuzzleSyncSnapshot) {
      levelManager.applyPuzzleSyncSnapshot(state, Boolean(onlineContext?.isHost));
      emitLevelSnapshotIfChanged(false);
    },
    applyRemoteLeverToggle(levelId: LevelId, leverId: string, isOn: boolean, actorName?: string) {
      if (levelId !== levelManager.getCurrentLevelId()) return;
      levelManager.applyRemoteLeverToggle(leverId, isOn, actorName);
      emitLevelSnapshotIfChanged(true);
    },
    pushNetworkToast(message: string, kind = 'puzzle') {
      levelManager.pushToast(message, kind);
      emitLevelSnapshotIfChanged(true);
    },
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleLeverKeyDown);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      keyboard.dispose();
      ledgeClimb.dispose();
      handGrab.dispose();
      handTargeting.dispose();
      cameraRig.dispose();
      networkedPhysics.dispose();
      remotePlayers.dispose();
      player.dispose();
      particles.dispose();
      levelManager.dispose();
      textures.dispose();
      audio.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mountContainer) {
        mountContainer.removeChild(renderer.domElement);
      }
    },
  };
}
