import { useCallback, useEffect, useRef, useState } from 'react';
import { createGameEngine } from './game/GameEngine';
import type {
  CampaignProgress,
  GameEngineHandle,
  HandTargetingHudSnapshot,
  LevelCompletionPayload,
  LevelId,
  LevelRuntimeSnapshot,
  MultiplayerSession,
} from './game/types';
import {
  CAMPAIGN_ORDER,
  isLevelUnlocked,
  loadCampaignProgress,
  markLevelCompleted,
  recordRelicFound,
  toggleUnlockAllProgress,
} from './game/progress';
import {
  loadGameSettings,
  saveGameSettings,
  type GameSettings,
} from './game/settings';
import { GameHud } from './components/GameHud';
import { MainMenu } from './components/MainMenu';
import { LevelSelectScreen } from './components/LevelSelectScreen';
import { PauseMenu } from './components/PauseMenu';
import { SettingsMenu } from './components/SettingsMenu';
import { LoadingScreen } from './components/LoadingScreen';
import { LevelCompleteModal } from './components/LevelCompleteModal';
import { MultiplayerModal } from './components/MultiplayerModal';
import { CreditsModal } from './components/CreditsModal';
import { QuitScreen } from './components/QuitScreen';
import {
  NetworkManager,
  type NetworkSnapshot,
} from './game/network/NetworkManager';
import type { RoomVisibility } from './game/network/protocol';

type AppScreen = 'main-menu' | 'level-select' | 'playing' | 'paused' | 'quit-exited';
type ActiveModal = 'none' | 'settings' | 'multiplayer' | 'credits' | 'quit-confirm';

const INITIAL_HAND_TARGETING: HandTargetingHudSnapshot = {
  left: {
    active: false,
    locked: false,
    held: false,
    mode: 'idle',
    surfaceKind: null,
    outOfReach: false,
    blockId: null,
  },
  right: {
    active: false,
    locked: false,
    held: false,
    mode: 'idle',
    surfaceKind: null,
    outOfReach: false,
    blockId: null,
  },
  hoverInReach: false,
  hoverKind: null,
};

const INITIAL_LEVEL_SNAPSHOT: LevelRuntimeSnapshot = {
  levelId: 'dream-world',
  levelTitle: 'Dream World',
  levelSubtitle: 'Sunlit Floating Archipelago',
  isSandbox: false,
  checkpointIndex: 0,
  totalCheckpoints: 2,
  relicsFound: 0,
  totalRelics: 3,
  elapsedSec: 0,
  status: 'playing',
  nearLeverLabel: null,
  activeObjective: '',
  toast: null,
};

const INITIAL_MULTIPLAYER: MultiplayerSession = {
  enabled: false,
  players: [],
  activePlayerIndex: 0,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngineHandle | null>(null);
  const networkRef = useRef<NetworkManager | null>(null);
  const loadingTimersRef = useRef<number[]>([]);

  const [progress, setProgress] = useState<CampaignProgress>(() => loadCampaignProgress());
  const progressRef = useRef<CampaignProgress>(progress);
  progressRef.current = progress;

  const [settings, setSettings] = useState<GameSettings>(() => loadGameSettings());
  const settingsRef = useRef<GameSettings>(settings);
  settingsRef.current = settings;

  const [screen, setScreen] = useState<AppScreen>('main-menu');
  const [modal, setModal] = useState<ActiveModal>('none');
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [activeLevelId, setActiveLevelId] = useState<LevelId>('dream-world');
  const [completion, setCompletion] = useState<LevelCompletionPayload | null>(null);
  const [multiplayer, setMultiplayer] = useState<MultiplayerSession>(INITIAL_MULTIPLAYER);
  const [networkSnapshot, setNetworkSnapshot] = useState<NetworkSnapshot>({
    connectionState: 'disconnected',
    localPlayerId: null,
    room: null,
    publicRooms: [],
    lastError: null,
    lastDisconnectNotice: null,
    latencyMs: null,
    jitterMs: 0,
    connectionQuality: 'offline',
    serverClockOffsetMs: 0,
    reconnectAttempt: 0,
  });

  // Loading screen state (real staged progress + error handling)
  const [loadingVisible, setLoadingVisible] = useState(false);
  const [loadingLevelId, setLoadingLevelId] = useState<LevelId>('dream-world');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState('Preparing world...');
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [isHudExpanded, setIsHudExpanded] = useState(true);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [handTargeting, setHandTargeting] =
    useState<HandTargetingHudSnapshot>(INITIAL_HAND_TARGETING);
  const [levelState, setLevelState] =
    useState<LevelRuntimeSnapshot>(INITIAL_LEVEL_SNAPSHOT);

  const clearLoadingTimers = useCallback(() => {
    for (const id of loadingTimersRef.current) {
      window.clearTimeout(id);
    }
    loadingTimersRef.current = [];
  }, []);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const engine = createGameEngine(
      container,
      {
        onPointerLockChange: (locked) => setIsPointerLocked(locked),
        onWebGLError: (message) => setWebglError(message),
        onHandTargetingChange: (snapshot) => setHandTargeting(snapshot),
        onLevelStateChange: (snapshot) => setLevelState(snapshot),
        onRelicCollected: (levelId, relicId, label) => {
          setProgress((prev) => recordRelicFound(prev, levelId, relicId));
          if (label && networkRef.current?.getSnapshot().room) {
            networkRef.current.sendRelicCollected(levelId, relicId, label);
          }
        },
        onLevelCompleted: (payload) => {
          setProgress((prev) =>
            markLevelCompleted(prev, payload.levelId, payload.elapsedSec, payload.foundRelics),
          );
          setCompletion(payload);
          engineRef.current?.setMode('paused');
        },
        onLocalCharacterState: (state) => {
          networkRef.current?.sendLocalCharacterState(state);
        },
        onPhysicsGrabClaim: (objectId, levelId, side, mode) => {
          networkRef.current?.sendGrabClaim(objectId, levelId, side, mode);
        },
        onPhysicsGrabRelease: (objectId, levelId, side, releasedWithMomentum) => {
          networkRef.current?.sendGrabRelease(objectId, levelId, side, releasedWithMomentum);
        },
        onPhysicsObjectsSync: (levelId, objects) => {
          networkRef.current?.sendPhysicsObjectsSync(levelId, objects);
        },
        onCoopObjectForce: (payload) => {
          networkRef.current?.sendCoopObjectForce(payload);
        },
        onPuzzleLeverToggled: (levelId, leverId, isOn, label) => {
          networkRef.current?.sendLeverToggle(levelId, leverId, isOn, label);
        },
        onPuzzleCheckpointReached: (levelId, index, spawnPos, spawnYaw, label) => {
          networkRef.current?.sendCheckpointReached(levelId, index, spawnPos, spawnYaw, label);
        },
        onPuzzleFinishReached: (levelId) => {
          networkRef.current?.sendFinishReached(levelId);
        },
        onHostPuzzleState: (state) => {
          networkRef.current?.sendHostPuzzleState(state);
        },
      },
      settingsRef.current,
    );

    engineRef.current = engine;

    return () => {
      clearLoadingTimers();
      engine?.dispose();
      engineRef.current = null;
    };
  }, [clearLoadingTimers]);

  const handleUiHover = useCallback(() => {
    engineRef.current?.playUiSound('hover');
  }, []);

  const handleUiClick = useCallback(() => {
    engineRef.current?.playUiSound('click');
  }, []);

  const handleUpdateSettings = useCallback((next: GameSettings) => {
    setSettings(next);
    saveGameSettings(next);
    engineRef.current?.applySettings(next);
  }, []);

  const handleTestAudio = useCallback(() => {
    engineRef.current?.playUiSound('test');
  }, []);

  const loadLevelWithScreen = useCallback(
    (levelId: LevelId) => {
      clearLoadingTimers();
      setCompletion(null);
      setModal('none');
      setLoadingError(null);
      setLoadingLevelId(levelId);
      setLoadingProgress(18);
      setLoadingStage('Clearing previous physics world...');
      setLoadingVisible(true);

      const failsafeTimer = window.setTimeout(() => {
        setLoadingError('Level initialization took longer than expected. Please retry or return to the Main Menu.');
        engineRef.current?.setMode('paused');
      }, 8000);

      const t1 = window.setTimeout(() => {
        setLoadingProgress(56);
        setLoadingStage('Building 3D geometry & interactive puzzles...');
      }, 130);

      const t2 = window.setTimeout(() => {
        try {
          if (!engineRef.current) {
            throw new Error('3D WebGL engine is unavailable.');
          }
          const savedRelics = progressRef.current.records[levelId]?.foundRelics ?? [];
          engineRef.current.loadLevel(levelId, savedRelics);
          window.clearTimeout(failsafeTimer);
          setLoadingProgress(90);
          setLoadingStage('Compiling lighting & shadows...');

          const t3 = window.setTimeout(() => {
            setLoadingProgress(100);
            setLoadingStage('Ready');
            engineRef.current?.setMode('playing');
            setActiveLevelId(levelId);
            setHasActiveSession(true);
            setScreen('playing');

            const t4 = window.setTimeout(() => {
              setLoadingVisible(false);
            }, 180);
            loadingTimersRef.current.push(t4);
          }, 120);
          loadingTimersRef.current.push(t3);
        } catch (err) {
          window.clearTimeout(failsafeTimer);
          const message =
            err instanceof Error
              ? err.message
              : 'An unexpected error occurred while initializing the 3D level.';
          setLoadingError(message);
          engineRef.current?.setMode('paused');
        }
      }, 240);

      loadingTimersRef.current.push(failsafeTimer, t1, t2);
    },
    [clearLoadingTimers],
  );

  const performLocalRestart = useCallback(() => {
    clearLoadingTimers();
    setCompletion(null);
    setModal('none');
    setLoadingError(null);
    setLoadingLevelId(activeLevelId);
    setLoadingProgress(35);
    setLoadingStage('Resetting puzzles & checkpoints...');
    setLoadingVisible(true);

    const t1 = window.setTimeout(() => {
      try {
        engineRef.current?.restartLevel();
        setLoadingProgress(100);
        setLoadingStage('Ready');
        engineRef.current?.setMode('playing');
        setScreen('playing');
        const t2 = window.setTimeout(() => {
          setLoadingVisible(false);
        }, 160);
        loadingTimersRef.current.push(t2);
      } catch (err) {
        setLoadingError(
          err instanceof Error ? err.message : 'Failed to restart level.',
        );
      }
    }, 150);
    loadingTimersRef.current.push(t1);
  }, [activeLevelId, clearLoadingTimers]);

  // Initialize central NetworkManager once and bridge snapshots, characters, physics & cooperative puzzles
  useEffect(() => {
    const net = new NetworkManager();
    networkRef.current = net;

    const unsubSnap = net.subscribe((snap) => {
      setNetworkSnapshot(snap);
      const localPlayer =
        snap.room && snap.localPlayerId
          ? snap.room.players.find((p) => p.id === snap.localPlayerId) ?? null
          : null;

      if (snap.room && localPlayer) {
        engineRef.current?.setOnlineSession({
          localPlayerId: localPlayer.id,
          localPlayerColor: localPlayer.color,
          localSpawnSlot: localPlayer.spawnSlot,
          isHost: snap.room.hostId === localPlayer.id,
          players: snap.room.players,
          serverClockOffsetMs: snap.serverClockOffsetMs,
          latencyMs: snap.latencyMs,
          jitterMs: snap.jitterMs,
        });
      } else {
        engineRef.current?.setOnlineSession(null);
      }
    });

    const unsubRemote = net.onRemoteCharacterState((state) => {
      engineRef.current?.applyRemoteCharacterState(state);
    });

    const unsubLevel = net.onRoomLevelSync((levelId) => {
      loadLevelWithScreen(levelId);
    });

    const unsubOwnership = net.onPhysicsOwnership((ownership) => {
      engineRef.current?.applyPhysicsOwnership(ownership);
    });

    const unsubPhysics = net.onPhysicsObjectsSync((levelId, objects) => {
      engineRef.current?.applyPhysicsObjectsSync(levelId, objects);
    });

    const unsubPhysicsAll = net.onPhysicsSyncAll((levelId, objects, ownerships) => {
      engineRef.current?.applyPhysicsSyncAll(levelId, objects, ownerships);
    });

    const unsubCoopForce = net.onCoopObjectForce((payload) => {
      engineRef.current?.applyCoopObjectForce(payload);
    });

    const unsubPuzzleState = net.onPuzzleState((state) => {
      engineRef.current?.applyPuzzleState(state);
    });

    const unsubLever = net.onLeverToggled((evt) => {
      if (evt.actorId === net.getSnapshot().localPlayerId) return;
      engineRef.current?.applyRemoteLeverToggle(evt.levelId, evt.leverId, evt.isOn, evt.actorName);
    });

    const unsubCoopEvent = net.onCoopEvent((evt) => {
      if (evt.actorId === net.getSnapshot().localPlayerId && evt.kind !== 'coop-grab') {
        return;
      }
      const toastKind =
        evt.kind === 'checkpoint'
          ? 'checkpoint'
          : evt.kind === 'relic'
            ? 'relic'
            : evt.kind === 'finish'
              ? 'complete'
              : 'puzzle';
      engineRef.current?.pushNetworkToast(evt.message, toastKind);
    });

    const unsubRestarted = net.onRoomRestarted((levelId, actorName) => {
      clearLoadingTimers();
      setCompletion(null);
      setModal('none');
      setLoadingError(null);
      setLoadingLevelId(levelId);
      setLoadingProgress(40);
      setLoadingStage(`${actorName} restarted the level...`);
      setLoadingVisible(true);

      const t1 = window.setTimeout(() => {
        try {
          if (engineRef.current?.getCurrentLevelId() !== levelId) {
            const savedRelics = progressRef.current.records[levelId]?.foundRelics ?? [];
            engineRef.current?.loadLevel(levelId, savedRelics);
          } else {
            engineRef.current?.restartLevel();
          }
          setLoadingProgress(100);
          setLoadingStage('Ready');
          engineRef.current?.setMode('playing');
          setActiveLevelId(levelId);
          setScreen('playing');
          engineRef.current?.pushNetworkToast(`${actorName} restarted the level`, 'respawn');
          const t2 = window.setTimeout(() => setLoadingVisible(false), 160);
          loadingTimersRef.current.push(t2);
        } catch (err) {
          setLoadingError(
            err instanceof Error ? err.message : 'Failed to synchronize level restart.',
          );
        }
      }, 140);
      loadingTimersRef.current.push(t1);
    });

    const unsubObjectsReset = net.onRoomObjectsReset((_levelId, actorName) => {
      engineRef.current?.resetBlocks();
      engineRef.current?.pushNetworkToast(`${actorName} reset puzzle objects`, 'puzzle');
    });

    const unsubRoomClosed = net.onRoomClosed((reason) => {
      engineRef.current?.pushNetworkToast(reason, 'respawn');
    });

    return () => {
      unsubSnap();
      unsubRemote();
      unsubLevel();
      unsubOwnership();
      unsubPhysics();
      unsubPhysicsAll();
      unsubCoopForce();
      unsubPuzzleState();
      unsubLever();
      unsubCoopEvent();
      unsubRestarted();
      unsubObjectsReset();
      unsubRoomClosed();
      net.dispose();
      networkRef.current = null;
    };
  }, [clearLoadingTimers, loadLevelWithScreen]);

  // Main Menu "Play Game": resumes active session or launches next uncompleted unlocked world
  const handlePlayGame = useCallback(() => {
    if (hasActiveSession) {
      setCompletion(null);
      setModal('none');
      setScreen('playing');
      engineRef.current?.setMode('playing');
      return;
    }

    const nextToPlay =
      CAMPAIGN_ORDER.find(
        (id) =>
          isLevelUnlocked(progressRef.current, id) &&
          !progressRef.current.records[id]?.completed,
      ) ?? 'dream-world';
    loadLevelWithScreen(nextToPlay);
  }, [hasActiveSession, loadLevelWithScreen]);

  const handleOpenMainMenu = useCallback(() => {
    clearLoadingTimers();
    setLoadingVisible(false);
    setLoadingError(null);
    setCompletion(null);
    setModal('none');
    setScreen('main-menu');
    engineRef.current?.setMode('menu');
  }, [clearLoadingTimers]);

  const handleOpenLevelSelect = useCallback(() => {
    setCompletion(null);
    setModal('none');
    setScreen('level-select');
    engineRef.current?.setMode('menu');
  }, []);

  const handlePauseGame = useCallback(() => {
    if (screen !== 'playing' || completion || loadingVisible) return;
    engineRef.current?.playUiSound('pause');
    engineRef.current?.setMode('paused');
    setScreen('paused');
  }, [screen, completion, loadingVisible]);

  const handleResumeGame = useCallback(() => {
    setModal('none');
    setScreen('playing');
    engineRef.current?.playUiSound('resume');
    engineRef.current?.setMode('playing');
  }, []);

  const handleRestartLevel = useCallback(() => {
    const net = networkRef.current;
    if (net?.getSnapshot().room) {
      if (net.isHost()) {
        net.restartRoomLevel();
      } else {
        engineRef.current?.pushNetworkToast('Only the room host can restart the shared level.', 'respawn');
      }
      return;
    }
    performLocalRestart();
  }, [performLocalRestart]);

  const handleSelectOrAdvanceLevel = useCallback(
    (levelId: LevelId) => {
      const net = networkRef.current;
      if (net?.getSnapshot().room) {
        if (net.isHost()) {
          net.setRoomLevel(levelId, true);
        } else {
          engineRef.current?.pushNetworkToast('Waiting for the room host to select the next world.', 'puzzle');
        }
        return;
      }
      loadLevelWithScreen(levelId);
    },
    [loadLevelWithScreen],
  );

  const handleNextMultiplayerTurn = useCallback(() => {
    setMultiplayer((prev) => {
      if (!prev.enabled || prev.players.length < 2) return prev;
      const nextIndex = (prev.activePlayerIndex + 1) % prev.players.length;
      return {
        ...prev,
        activePlayerIndex: nextIndex,
        players: prev.players.map((p, idx) =>
          idx === nextIndex ? { ...p, turns: p.turns + 1 } : p,
        ),
      };
    });
    engineRef.current?.playUiSound('click');
  }, []);

  // Global keyboard handler for Pause key and Tab multiplayer handoff during gameplay
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (loadingVisible || modal !== 'none') return;

      const pauseCode = settingsRef.current.controls.keyBindings.pause;
      if (screen === 'playing' && !completion && event.code === pauseCode) {
        event.preventDefault();
        handlePauseGame();
        return;
      }

      if (screen === 'playing' && !completion && event.code === 'Tab' && multiplayer.enabled) {
        event.preventDefault();
        handleNextMultiplayerTurn();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    screen,
    modal,
    completion,
    loadingVisible,
    multiplayer.enabled,
    handlePauseGame,
    handleNextMultiplayerTurn,
  ]);

  const handleStartMultiplayer = useCallback(
    (nextSession: MultiplayerSession, levelId: LevelId) => {
      setMultiplayer(nextSession);
      setModal('none');
      loadLevelWithScreen(levelId);
    },
    [loadLevelWithScreen],
  );

  const handleDisableMultiplayer = useCallback(() => {
    setMultiplayer(INITIAL_MULTIPLAYER);
  }, []);

  const handleHostOnlineRoom = useCallback(
    (options: {
      displayName: string;
      visibility: RoomVisibility;
      maxPlayers: number;
      levelId: LevelId;
    }) => {
      networkRef.current?.hostRoom(options).catch(() => {});
    },
    [],
  );

  const handleJoinOnlineRoom = useCallback(
    (options: { roomId: string; displayName: string }) => {
      networkRef.current?.joinRoom(options).catch(() => {});
    },
    [],
  );

  const handleLeaveOnlineRoom = useCallback(() => {
    networkRef.current?.leaveRoom();
  }, []);

  const handleCloseOnlineRoom = useCallback(() => {
    networkRef.current?.closeRoom();
  }, []);

  const handleRefreshPublicRooms = useCallback(() => {
    networkRef.current?.refreshPublicRooms().catch(() => {});
  }, []);

  const handleChangeOnlineRoomLevel = useCallback((levelId: LevelId) => {
    networkRef.current?.setRoomLevel(levelId, false);
  }, []);

  const handleEnterOnlineWorld = useCallback(
    (levelId: LevelId, isHost: boolean) => {
      setModal('none');
      if (isHost) {
        if (networkSnapshot.room?.state === 'in-game' && activeLevelId === levelId && hasActiveSession) {
          setScreen('playing');
          engineRef.current?.setMode('playing');
          return;
        }
        networkRef.current?.setRoomLevel(levelId, true);
        return;
      }
      if (activeLevelId === levelId && hasActiveSession) {
        setScreen('playing');
        engineRef.current?.setMode('playing');
        return;
      }
      loadLevelWithScreen(levelId);
    },
    [activeLevelId, hasActiveSession, loadLevelWithScreen, networkSnapshot.room?.state],
  );

  const handleClearNetworkError = useCallback(() => {
    networkRef.current?.clearError();
  }, []);

  const handleConfirmQuit = useCallback(() => {
    networkRef.current?.disconnect();
    setModal('none');
    setCompletion(null);
    setHasActiveSession(false);
    engineRef.current?.setMode('paused');
    setScreen('quit-exited');
  }, []);

  const handleRelaunch = useCallback(() => {
    setScreen('main-menu');
    engineRef.current?.setMode('menu');
  }, []);

  const handleToggleUnlockAll = useCallback(() => {
    setProgress((prev) => toggleUnlockAllProgress(prev));
  }, []);

  const handleRespawnCheckpoint = useCallback(() => {
    engineRef.current?.respawnAtCheckpoint();
  }, []);

  const handleToggleExpanded = useCallback(() => {
    setIsHudExpanded((prev) => !prev);
  }, []);

  const handleDropFromSky = useCallback(() => {
    engineRef.current?.dropCharacterFromSky();
  }, []);

  const handleNudge = useCallback(() => {
    engineRef.current?.nudgeCharacter();
  }, []);

  const handleResetBlocks = useCallback(() => {
    if (networkRef.current?.getSnapshot().room) {
      networkRef.current.resetRoomObjects();
      return;
    }
    engineRef.current?.resetBlocks();
  }, []);

  const handleTogglePointerLock = useCallback(() => {
    engineRef.current?.togglePointerLock();
  }, []);

  const isOnlineHost = Boolean(
    networkSnapshot.room &&
      networkSnapshot.localPlayerId &&
      networkSnapshot.room.hostId === networkSnapshot.localPlayerId,
  );
  const isOnlineGuest = Boolean(networkSnapshot.room && !isOnlineHost);

  const completedBestTime = completion
    ? progress.records[completion.levelId]?.bestTimeSec ?? completion.elapsedSec
    : null;

  return (
    <main className="relative h-full w-full overflow-hidden bg-[#d8ecf8]">
      {/* Isolated WebGL canvas container (mounted once; never unmounted on UI screen switches) */}
      <div
        ref={canvasMountRef}
        className={`fixed inset-0 h-full w-full ${
          screen === 'playing' && !completion && handTargeting.hoverInReach
            ? 'cursor-crosshair'
            : 'cursor-default'
        }`}
        aria-label="Wobblepeak 3D game viewport"
      />

      {webglError ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-[#a7d6f8] to-[#f4ece2] p-6">
          <div className="max-w-md rounded-2xl border border-slate-900/12 bg-white/96 p-6 text-center shadow-lg">
            <h1
              className="text-2xl font-bold text-slate-900"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Wobblepeak
            </h1>
            <p className="mt-2 text-sm text-slate-600">{webglError}</p>
            <p className="mt-1 text-xs text-slate-500">
              Please enable hardware acceleration or use a WebGL2-compatible browser to view the 3D scene.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* 1. Animated 3D Main Menu */}
          {screen === 'main-menu' && (
            <MainMenu
              progress={progress}
              hasActiveSession={hasActiveSession}
              isModalOpen={modal !== 'none'}
              onlineRoomLabel={
                networkSnapshot.room
                  ? `${networkSnapshot.room.roomId} · ${networkSnapshot.room.players.length}/${networkSnapshot.room.maxPlayers}`
                  : null
              }
              onPlayGame={handlePlayGame}
              onOpenLevelSelect={handleOpenLevelSelect}
              onOpenMultiplayer={() => setModal('multiplayer')}
              onOpenSettings={() => setModal('settings')}
              onOpenCredits={() => setModal('credits')}
              onQuitGame={() => setModal('quit-confirm')}
              onUiHover={handleUiHover}
              onUiClick={handleUiClick}
            />
          )}

          {/* 2. Level Selection Screen */}
          {screen === 'level-select' && (
            <LevelSelectScreen
              progress={progress}
              activeLevelId={activeLevelId}
              hasActiveSession={hasActiveSession}
              onSelectLevel={handleSelectOrAdvanceLevel}
              onResumeActiveLevel={handleResumeGame}
              onBackToMainMenu={handleOpenMainMenu}
              onToggleUnlockAll={handleToggleUnlockAll}
              onUiHover={handleUiHover}
              onUiClick={handleUiClick}
            />
          )}

          {/* 3. In-Game Minimal HUD */}
          {(screen === 'playing' || screen === 'paused') && (
            <GameHud
              isPointerLocked={isPointerLocked}
              isExpanded={isHudExpanded}
              handTargeting={handTargeting}
              levelState={levelState}
              settings={settings}
              multiplayer={multiplayer}
              networkSnapshot={networkSnapshot}
              onToggleExpanded={handleToggleExpanded}
              onPauseGame={handlePauseGame}
              onOpenLevelSelect={handleOpenLevelSelect}
              onOpenMultiplayer={() => setModal('multiplayer')}
              onDismissNetworkNotice={handleClearNetworkError}
              onNextMultiplayerTurn={handleNextMultiplayerTurn}
              onRespawnCheckpoint={handleRespawnCheckpoint}
              onRestartLevel={handleRestartLevel}
              onDropFromSky={handleDropFromSky}
              onNudge={handleNudge}
              onResetBlocks={handleResetBlocks}
              onTogglePointerLock={handleTogglePointerLock}
            />
          )}

          {/* 4. Pause Menu Overlay */}
          {screen === 'paused' && modal === 'none' && !completion && (
            <PauseMenu
              levelTitle={levelState.levelTitle}
              levelSubtitle={levelState.levelSubtitle}
              elapsedSec={levelState.elapsedSec}
              isSandbox={levelState.isSandbox}
              isOnlineGuest={isOnlineGuest}
              onResume={handleResumeGame}
              onRestartLevel={handleRestartLevel}
              onOpenSettings={() => setModal('settings')}
              onReturnToMainMenu={handleOpenMainMenu}
              onUiHover={handleUiHover}
              onUiClick={handleUiClick}
            />
          )}

          {/* 5. Settings Overlay (available from Main Menu and Pause Menu) */}
          {modal === 'settings' && (
            <SettingsMenu
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onTestAudio={handleTestAudio}
              onClose={() => setModal('none')}
              onUiClick={handleUiClick}
            />
          )}

          {/* Online Multiplayer & Local Co-op Relay Modal */}
          {modal === 'multiplayer' && (
            <MultiplayerModal
              progress={progress}
              session={multiplayer}
              networkSnapshot={networkSnapshot}
              onHostOnlineRoom={handleHostOnlineRoom}
              onJoinOnlineRoom={handleJoinOnlineRoom}
              onLeaveOnlineRoom={handleLeaveOnlineRoom}
              onCloseOnlineRoom={handleCloseOnlineRoom}
              onRefreshPublicRooms={handleRefreshPublicRooms}
              onEnterOnlineWorld={handleEnterOnlineWorld}
              onChangeOnlineRoomLevel={handleChangeOnlineRoomLevel}
              onClearNetworkError={handleClearNetworkError}
              onStartMultiplayer={handleStartMultiplayer}
              onDisableMultiplayer={handleDisableMultiplayer}
              onClose={() => setModal('none')}
              onUiClick={handleUiClick}
            />
          )}

          {/* Credits Modal */}
          {modal === 'credits' && (
            <CreditsModal
              onClose={() => setModal('none')}
              onUiClick={handleUiClick}
            />
          )}

          {/* Quit Confirmation / Session Ended Screen */}
          {modal === 'quit-confirm' && (
            <QuitScreen
              mode="confirm"
              onConfirmQuit={handleConfirmQuit}
              onCancelQuit={() => setModal('none')}
              onRelaunch={handleRelaunch}
              onUiClick={handleUiClick}
            />
          )}
          {screen === 'quit-exited' && (
            <QuitScreen
              mode="exited"
              onConfirmQuit={handleConfirmQuit}
              onCancelQuit={() => setModal('none')}
              onRelaunch={handleRelaunch}
              onUiClick={handleUiClick}
            />
          )}

          {/* 7. Level Completion Screen */}
          {completion && (screen === 'playing' || screen === 'paused') && (
            <LevelCompleteModal
              completion={completion}
              bestTimeSec={completedBestTime}
              multiplayer={multiplayer}
              onlineRoom={networkSnapshot.room}
              isOnlineHost={isOnlineHost}
              onNextLevel={handleSelectOrAdvanceLevel}
              onReplayLevel={handleRestartLevel}
              onReturnToLevelSelect={handleOpenLevelSelect}
              onReturnToMainMenu={handleOpenMainMenu}
              onUiHover={handleUiHover}
              onUiClick={handleUiClick}
            />
          )}

          {/* 6. Stylized Level Loading Screen with Progress & Error Handling */}
          <LoadingScreen
            visible={loadingVisible}
            levelId={loadingLevelId}
            progressPercent={loadingProgress}
            stageLabel={loadingStage}
            errorMessage={loadingError}
            onRetry={() => loadLevelWithScreen(loadingLevelId)}
            onReturnToMenu={handleOpenMainMenu}
          />
        </>
      )}
    </main>
  );
}
