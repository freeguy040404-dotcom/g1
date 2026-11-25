import * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import type {
  DynamicBlockInstance,
  ImpactEffectCallback,
  LevelCompletionPayload,
  LevelId,
  LevelRuntimeSnapshot,
  LevelToastEvent,
} from '../types';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ProceduralTextureSet } from '../textures';
import type { ProceduralAudio } from '../audio';
import { ObservatoryEnvironment } from '../world/ObservatoryEnvironment';
import type { BuiltLevel, LevelLightingTheme } from './LevelBuilder';
import { getLevelCatalogEntry } from './levelCatalog';
import { buildDreamWorldLevel } from './DreamWorldLevel';
import { buildWarehouseLevel } from './WarehouseLevel';
import { buildMountainAdventureLevel } from './MountainAdventureLevel';
import { buildConstructionSiteLevel } from './ConstructionSiteLevel';
import { buildMedievalCastleLevel } from './MedievalCastleLevel';
import type { PuzzleSyncSnapshot } from '../network/protocol';

const OBSERVATORY_LIGHTING: LevelLightingTheme = {
  backgroundHex: 0xd8ebf8,
  fogHex: 0xe6eff6,
  fogDensity: 0.0062,
  hemiSkyHex: 0xb2dcff,
  hemiGroundHex: 0xd4c3ae,
  hemiIntensity: 0.92,
  sunHex: 0xfff3de,
  sunIntensity: 2.05,
  sunOffset: [18, 28, 16],
  rimHex: 0xcbe2ff,
  rimIntensity: 0.55,
  skyStops: [],
};

export interface LevelSceneLights {
  hemiLight: THREE.HemisphereLight;
  sunKeyLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
}

export interface LevelManagerCallbacks {
  onLevelCompleted?: (payload: LevelCompletionPayload) => void;
  onRelicCollected?: (levelId: LevelId, relicId: string, label?: string) => void;
  onCheckpointReached?: (
    levelId: LevelId,
    index: number,
    spawnPos: [number, number, number],
    spawnYaw: number,
    label: string,
  ) => void;
  onLeverToggled?: (levelId: LevelId, leverId: string, isOn: boolean, label: string) => void;
  onImpactEffect?: ImpactEffectCallback;
}

export interface LoadedLevelContext {
  levelId: LevelId;
  cameraColliders: THREE.Object3D[];
  dynamicBlocks: DynamicBlockInstance[];
  spawnPos: [number, number, number];
  spawnYaw: number;
  fallResetY: number;
  minCameraY: number;
  isSandbox: boolean;
}

export class LevelManager {
  private readonly scene: THREE.Scene;
  private readonly lights: LevelSceneLights;
  private readonly physics: PhysicsWorld;
  private readonly textures: ProceduralTextureSet;
  private readonly audio: ProceduralAudio;
  private readonly callbacks: LevelManagerCallbacks;

  private currentLevelId: LevelId = 'dream-world';
  private builtLevel: BuiltLevel | null = null;
  private observatoryEnv: ObservatoryEnvironment | null = null;

  private initialSpawnPos: [number, number, number] = [0, 2.2, 0];
  private initialSpawnYaw = 0;
  private activeSpawnPos: [number, number, number] = [0, 2.2, 0];
  private activeSpawnYaw = 0;
  private sunOffset: [number, number, number] = [18, 28, 16];

  private checkpointIndex = 0;
  private totalCheckpoints = 0;
  private totalRelics = 0;
  private foundRelics = new Set<string>();
  private elapsedSec = 0;
  private status: 'playing' | 'completed' = 'playing';
  private activeObjective = '';

  private toast: LevelToastEvent | null = null;
  private toastRemainingSec = 0;
  private nextToastId = 1;
  private multiplayerCoopActive = false;

  constructor(
    scene: THREE.Scene,
    lights: LevelSceneLights,
    physics: PhysicsWorld,
    textures: ProceduralTextureSet,
    audio: ProceduralAudio,
    callbacks: LevelManagerCallbacks,
  ) {
    this.scene = scene;
    this.lights = lights;
    this.physics = physics;
    this.textures = textures;
    this.audio = audio;
    this.callbacks = callbacks;
  }

  public loadLevel(
    levelId: LevelId,
    playerBody: CANNON.Body,
    alreadyFoundRelics: string[] = [],
  ): LoadedLevelContext {
    this.unloadCurrent(playerBody);

    this.currentLevelId = levelId;
    this.checkpointIndex = 0;
    this.elapsedSec = 0;
    this.status = 'playing';
    this.foundRelics = new Set<string>(alreadyFoundRelics);
    this.toast = null;
    this.toastRemainingSec = 0;

    if (levelId === 'observatory') {
      const obs = new ObservatoryEnvironment(
        this.scene,
        this.physics,
        this.textures,
        this.audio,
      );
      this.observatoryEnv = obs;
      this.applyLighting(OBSERVATORY_LIGHTING);

      this.initialSpawnPos = [0, 6.2, 1.5];
      this.initialSpawnYaw = 0;
      this.activeSpawnPos = [...this.initialSpawnPos];
      this.activeSpawnYaw = 0;
      this.totalCheckpoints = 0;
      this.totalRelics = 0;
      this.activeObjective = 'Freeform sandbox · Practice grabbing, stacking, pushing, and ledge climbing.';

      return {
        levelId,
        cameraColliders: obs.cameraColliders,
        dynamicBlocks: obs.dynamicBlocks,
        spawnPos: this.initialSpawnPos,
        spawnYaw: this.initialSpawnYaw,
        fallResetY: -12,
        minCameraY: 0.65,
        isSandbox: true,
      };
    }

    const puzzleCallbacks = {
      onCheckpointReached: (
        index: number,
        spawnPos: [number, number, number],
        spawnYaw: number,
        label?: string,
      ) => {
        if (index > this.checkpointIndex) {
          this.checkpointIndex = index;
          this.activeSpawnPos = [...spawnPos];
          this.activeSpawnYaw = spawnYaw;
          this.callbacks.onCheckpointReached?.(
            this.currentLevelId,
            index,
            spawnPos,
            spawnYaw,
            label ?? `Checkpoint ${index}`,
          );
        }
      },
      onRelicFound: (relicId: string, label?: string) => {
        this.foundRelics.add(relicId);
        this.callbacks.onRelicCollected?.(this.currentLevelId, relicId, label);
      },
      onFinishReached: () => {
        if (this.status === 'completed') return;
        this.status = 'completed';
        const catalog = getLevelCatalogEntry(this.currentLevelId);
        this.pushToast(`${catalog.title} completed!`, 'complete');
        this.callbacks.onLevelCompleted?.({
          levelId: this.currentLevelId,
          elapsedSec: this.elapsedSec,
          foundRelics: Array.from(this.foundRelics),
          totalRelics: this.totalRelics,
        });
      },
      onLeverToggled: (leverId: string, isOn: boolean, label: string) => {
        this.callbacks.onLeverToggled?.(this.currentLevelId, leverId, isOn, label);
      },
      onToast: (message: string, kind: LevelToastEvent['kind']) => {
        this.pushToast(message, kind);
      },
      onImpactEffect: this.callbacks.onImpactEffect,
    };

    const foundList = Array.from(this.foundRelics);
    let built: BuiltLevel;
    switch (levelId) {
      case 'dream-world':
        built = buildDreamWorldLevel(
          this.physics,
          this.textures,
          this.audio,
          puzzleCallbacks,
          foundList,
        );
        break;
      case 'warehouse':
        built = buildWarehouseLevel(
          this.physics,
          this.textures,
          this.audio,
          puzzleCallbacks,
          foundList,
        );
        break;
      case 'mountain-adventure':
        built = buildMountainAdventureLevel(
          this.physics,
          this.textures,
          this.audio,
          puzzleCallbacks,
          foundList,
        );
        break;
      case 'construction-site':
        built = buildConstructionSiteLevel(
          this.physics,
          this.textures,
          this.audio,
          puzzleCallbacks,
          foundList,
        );
        break;
      case 'medieval-castle':
        built = buildMedievalCastleLevel(
          this.physics,
          this.textures,
          this.audio,
          puzzleCallbacks,
          foundList,
        );
        break;
    }

    this.builtLevel = built;
    this.builtLevel.puzzleSystem?.setMultiplayerCoopActive(this.multiplayerCoopActive);
    this.scene.add(built.root);
    this.applyLighting(built.lighting);

    this.initialSpawnPos = [...built.spawnPos];
    this.initialSpawnYaw = built.spawnYaw;
    this.activeSpawnPos = [...built.spawnPos];
    this.activeSpawnYaw = built.spawnYaw;
    this.totalCheckpoints = built.puzzleSystem?.getTotalCheckpoints() ?? 0;
    this.totalRelics = built.puzzleSystem?.getTotalRelics() ?? 0;
    this.activeObjective = built.defaultObjective;

    return {
      levelId,
      cameraColliders: built.cameraColliders,
      dynamicBlocks: built.dynamicBlocks,
      spawnPos: built.spawnPos,
      spawnYaw: built.spawnYaw,
      fallResetY: built.fallResetY,
      minCameraY: built.minCameraY,
      isSandbox: false,
    };
  }

  private applyLighting(theme: LevelLightingTheme): void {
    this.scene.background = new THREE.Color(theme.backgroundHex);
    this.scene.fog = new THREE.FogExp2(theme.fogHex, theme.fogDensity);
    this.lights.hemiLight.color.setHex(theme.hemiSkyHex);
    this.lights.hemiLight.groundColor.setHex(theme.hemiGroundHex);
    this.lights.hemiLight.intensity = theme.hemiIntensity;
    this.lights.sunKeyLight.color.setHex(theme.sunHex);
    this.lights.sunKeyLight.intensity = theme.sunIntensity;
    this.lights.rimLight.color.setHex(theme.rimHex);
    this.lights.rimLight.intensity = theme.rimIntensity;
    this.sunOffset = [...theme.sunOffset];
  }

  private unloadCurrent(playerBody?: CANNON.Body): void {
    if (this.builtLevel) {
      this.scene.remove(this.builtLevel.root);
      this.builtLevel.dispose();
      this.builtLevel = null;
    }
    if (this.observatoryEnv) {
      this.scene.remove(this.observatoryEnv.root);
      this.observatoryEnv.dispose();
      this.observatoryEnv = null;
    }
    if (playerBody) {
      this.physics.clearLevelBodies(playerBody);
    }
  }

  public stepPhysics(
    fixedDt: number,
    playerBody: CANNON.Body,
    remotePlayerPositions: THREE.Vector3[] = [],
    isGuestRemoteSimulated = false,
  ): void {
    if (this.builtLevel?.puzzleSystem) {
      this.builtLevel.puzzleSystem.stepPhysics(
        fixedDt,
        playerBody,
        this.builtLevel.dynamicBlocks,
        remotePlayerPositions,
        isGuestRemoteSimulated,
      );
    }
  }

  public setMultiplayerCoopActive(active: boolean): void {
    this.multiplayerCoopActive = active;
    this.builtLevel?.puzzleSystem?.setMultiplayerCoopActive(active);
  }

  public applyRemoteLeverToggle(leverId: string, isOn: boolean, actorName?: string): void {
    this.builtLevel?.puzzleSystem?.applyRemoteLeverToggle(leverId, isOn, actorName);
  }

  public getPuzzleSyncSnapshot(): PuzzleSyncSnapshot | null {
    if (!this.builtLevel?.puzzleSystem) return null;
    return this.builtLevel.puzzleSystem.getNetworkSnapshot(
      this.currentLevelId,
      this.checkpointIndex,
      this.checkpointIndex > 0 ? [...this.activeSpawnPos] : null,
      this.activeSpawnYaw,
      this.status === 'completed',
    );
  }

  public applyPuzzleSyncSnapshot(snapshot: PuzzleSyncSnapshot, isHost: boolean): void {
    if (snapshot.levelId !== this.currentLevelId || !this.builtLevel?.puzzleSystem) return;
    const { newlyCollectedRelics, newlyCompleted } =
      this.builtLevel.puzzleSystem.applyNetworkSnapshot(snapshot, isHost);

    if (snapshot.checkpointIndex > this.checkpointIndex && snapshot.checkpointSpawnPos) {
      this.checkpointIndex = snapshot.checkpointIndex;
      this.activeSpawnPos = [...snapshot.checkpointSpawnPos];
      this.activeSpawnYaw = snapshot.checkpointSpawnYaw;
      this.audio.playCheckpointChime();
    }

    for (const relicId of newlyCollectedRelics) {
      this.foundRelics.add(relicId);
      this.callbacks.onRelicCollected?.(this.currentLevelId, relicId);
    }

    if (newlyCompleted && this.status !== 'completed') {
      this.status = 'completed';
      this.audio.playLevelComplete();
      const catalog = getLevelCatalogEntry(this.currentLevelId);
      this.pushToast(`${catalog.title} completed together!`, 'complete');
      this.callbacks.onLevelCompleted?.({
        levelId: this.currentLevelId,
        elapsedSec: this.elapsedSec,
        foundRelics: Array.from(this.foundRelics),
        totalRelics: this.totalRelics,
      });
    }
  }

  public updateVisuals(
    dt: number,
    elapsedSeconds: number,
    playerPos: THREE.Vector3,
    leftGrabAttempt: boolean,
    rightGrabAttempt: boolean,
    isPaused: boolean,
  ): void {
    if (!isPaused && this.status === 'playing' && this.currentLevelId !== 'observatory') {
      this.elapsedSec += dt;
    }

    if (this.toastRemainingSec > 0) {
      this.toastRemainingSec = Math.max(0, this.toastRemainingSec - dt);
      if (this.toastRemainingSec === 0) {
        this.toast = null;
      }
    }

    if (this.observatoryEnv) {
      this.observatoryEnv.syncPhysicsVisuals(elapsedSeconds);
      return;
    }

    if (this.builtLevel) {
      this.builtLevel.updateVisuals(dt, elapsedSeconds);
      if (this.builtLevel.puzzleSystem && !isPaused) {
        this.builtLevel.puzzleSystem.updateVisuals(
          dt,
          elapsedSeconds,
          playerPos,
          leftGrabAttempt,
          rightGrabAttempt,
        );
      }
    }
  }

  public tryToggleNearestLever(playerPos: THREE.Vector3): boolean {
    if (!this.builtLevel?.puzzleSystem) return false;
    return this.builtLevel.puzzleSystem.tryToggleNearestLever(playerPos);
  }

  public restartCurrentLevel(): { pos: [number, number, number]; yaw: number } {
    this.checkpointIndex = 0;
    this.elapsedSec = 0;
    this.status = 'playing';
    this.activeSpawnPos = [...this.initialSpawnPos];
    this.activeSpawnYaw = this.initialSpawnYaw;
    this.toast = null;
    this.toastRemainingSec = 0;

    if (this.observatoryEnv) {
      this.observatoryEnv.resetBlocks();
    } else if (this.builtLevel) {
      this.builtLevel.resetDynamicBlocks();
      this.builtLevel.puzzleSystem?.resetPuzzles();
    }

    return {
      pos: [...this.activeSpawnPos],
      yaw: this.activeSpawnYaw,
    };
  }

  public resetObjects(): void {
    if (this.observatoryEnv) {
      this.observatoryEnv.resetBlocks();
    } else if (this.builtLevel) {
      this.builtLevel.resetDynamicBlocks();
      this.pushToast('Puzzle objects reset', 'puzzle');
    }
  }

  public pushToast(message: string, kind: LevelToastEvent['kind']): void {
    this.toast = {
      id: this.nextToastId++,
      message,
      kind,
    };
    this.toastRemainingSec = kind === 'complete' ? 4.5 : 3.2;
  }

  public getCurrentLevelId(): LevelId {
    return this.currentLevelId;
  }

  public getActiveSpawn(): { pos: [number, number, number]; yaw: number } {
    return {
      pos: [...this.activeSpawnPos],
      yaw: this.activeSpawnYaw,
    };
  }

  public getSunOffset(): [number, number, number] {
    return this.sunOffset;
  }

  public getSnapshot(): LevelRuntimeSnapshot {
    const entry = getLevelCatalogEntry(this.currentLevelId);
    return {
      levelId: this.currentLevelId,
      levelTitle: entry.title,
      levelSubtitle: entry.subtitle,
      isSandbox: Boolean(entry.isSandbox),
      checkpointIndex: this.checkpointIndex,
      totalCheckpoints: this.totalCheckpoints,
      relicsFound: this.foundRelics.size,
      totalRelics: this.totalRelics,
      elapsedSec: Math.floor(this.elapsedSec),
      status: this.status,
      nearLeverLabel: this.builtLevel?.puzzleSystem?.getNearLeverLabel() ?? null,
      activeObjective: this.activeObjective,
      toast: this.toast,
    };
  }

  public dispose(): void {
    this.unloadCurrent();
  }
}
