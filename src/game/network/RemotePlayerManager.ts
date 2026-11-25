import * as THREE from 'three';
import type { LevelId } from '../types';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ProceduralTextureSet } from '../textures';
import {
  computeSpawnPositionForSlot,
  type CharacterSyncPayload,
  type NetworkPlayerInfo,
} from './protocol';
import { RemotePlayerAvatar } from './RemotePlayerAvatar';

/**
 * Manages spawning, updating, and disposing all remote multiplayer character avatars
 * inside the active 3D scene while preventing duplicate spawns and filtering out
 * the local player's own ID.
 */
export class RemotePlayerManager {
  private readonly scene: THREE.Scene;
  private readonly textures: ProceduralTextureSet;
  private readonly physics: PhysicsWorld | null;
  private readonly avatars = new Map<string, RemotePlayerAvatar>();
  private readonly posPool: THREE.Vector3[] = [];

  private localPlayerId: string | null = null;
  private activeLevelId: LevelId = 'dream-world';
  private baseSpawnPos: [number, number, number] = [0, 2.2, 0];
  private baseSpawnYaw = 0;

  constructor(
    scene: THREE.Scene,
    textures: ProceduralTextureSet,
    physics: PhysicsWorld | null = null,
  ) {
    this.scene = scene;
    this.textures = textures;
    this.physics = physics;
  }

  public setLevelContext(
    levelId: LevelId,
    spawnPos: [number, number, number],
    spawnYaw: number,
  ): void {
    this.activeLevelId = levelId;
    this.baseSpawnPos = [...spawnPos];
    this.baseSpawnYaw = spawnYaw;
  }

  public syncRoster(
    localPlayerId: string | null,
    players: NetworkPlayerInfo[],
  ): void {
    this.localPlayerId = localPlayerId;

    if (!localPlayerId || players.length === 0) {
      this.clear();
      return;
    }

    const activeRemoteIds = new Set<string>();

    for (const player of players) {
      if (player.id === localPlayerId) continue;
      activeRemoteIds.add(player.id);

      const existing = this.avatars.get(player.id);
      if (existing) {
        existing.updatePlayerInfo(player);
      } else {
        const spawnPos = computeSpawnPositionForSlot(
          this.baseSpawnPos,
          this.baseSpawnYaw,
          player.spawnSlot,
        );
        const avatar = new RemotePlayerAvatar(
          this.scene,
          this.textures,
          player,
          spawnPos,
          this.baseSpawnYaw,
          this.physics,
        );
        this.avatars.set(player.id, avatar);
      }
    }

    // Cleanly remove & dispose any players who disconnected or left the room
    for (const [playerId, avatar] of this.avatars.entries()) {
      if (!activeRemoteIds.has(playerId)) {
        avatar.dispose();
        this.avatars.delete(playerId);
      }
    }
  }

  public applyRemoteState(state: CharacterSyncPayload): void {
    if (!this.localPlayerId || state.playerId === this.localPlayerId) return;
    if (state.levelId !== this.activeLevelId) return;

    const avatar = this.avatars.get(state.playerId);
    if (!avatar) return;
    avatar.pushSnapshot(state);
  }

  public update(
    dt: number,
    elapsedSeconds: number,
    cameraPosition: THREE.Vector3,
    serverClockOffsetMs: number,
    jitterMs = 0,
  ): void {
    for (const avatar of this.avatars.values()) {
      avatar.update(dt, elapsedSeconds, cameraPosition, serverClockOffsetMs, jitterMs);
    }
  }

  /**
   * Returns a zero-GC list of live remote player world positions for cooperative
   * pressure plate weighting and shared mechanism evaluation.
   */
  public getRemotePlayerPositions(): THREE.Vector3[] {
    const result: THREE.Vector3[] = [];
    let idx = 0;
    for (const avatar of this.avatars.values()) {
      let vec = this.posPool[idx];
      if (!vec) {
        vec = new THREE.Vector3();
        this.posPool.push(vec);
      }
      avatar.getWorldPosition(vec);
      result.push(vec);
      idx += 1;
    }
    return result;
  }

  public getRemoteCount(): number {
    return this.avatars.size;
  }

  public clear(): void {
    for (const avatar of this.avatars.values()) {
      avatar.dispose();
    }
    this.avatars.clear();
  }

  public dispose(): void {
    this.clear();
  }
}

