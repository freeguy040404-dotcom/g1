export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';
export type ResolutionScale = 0.75 | 1 | 1.25 | 1.5;
export type FpsLimit = 0 | 30 | 60 | 120;

export interface KeyBindings {
  forward: string;
  backward: string;
  left: string;
  right: string;
  jump: string;
  run: string;
  leftGrab: string;
  rightGrab: string;
  interact: string;
  pause: string;
}

export interface GameSettings {
  graphics: {
    qualityPreset: QualityPreset;
    resolutionScale: ResolutionScale;
    shadowsEnabled: boolean;
    antialias: boolean;
    fpsLimit: FpsLimit;
  };
  audio: {
    masterVolume: number;
    musicVolume: number;
    sfxVolume: number;
    environmentVolume: number;
    muted: boolean;
  };
  controls: {
    keyboardSensitivity: number;
    cameraSensitivity: number;
    invertMouseY: boolean;
    keyBindings: KeyBindings;
  };
  gameplay: {
    cameraDistance: number;
    autoMantleAssist: boolean;
    showInteractionHints: boolean;
  };
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  run: 'ShiftLeft',
  leftGrab: 'KeyQ',
  rightGrab: 'KeyE',
  interact: 'KeyF',
  pause: 'Escape',
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  graphics: {
    qualityPreset: 'high',
    resolutionScale: 1,
    shadowsEnabled: true,
    antialias: true,
    fpsLimit: 0,
  },
  audio: {
    masterVolume: 0.85,
    musicVolume: 0.45,
    sfxVolume: 0.85,
    environmentVolume: 0.68,
    muted: false,
  },
  controls: {
    keyboardSensitivity: 1.0,
    cameraSensitivity: 1.0,
    invertMouseY: false,
    keyBindings: { ...DEFAULT_KEY_BINDINGS },
  },
  gameplay: {
    cameraDistance: 6.6,
    autoMantleAssist: true,
    showInteractionHints: true,
  },
};

const SETTINGS_STORAGE_KEY = 'wobblepeak_settings_v1';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function applyQualityPresetValues(
  preset: QualityPreset,
  current: GameSettings['graphics'],
): GameSettings['graphics'] {
  switch (preset) {
    case 'low':
      return {
        ...current,
        qualityPreset: 'low',
        resolutionScale: 0.75,
        shadowsEnabled: false,
        antialias: false,
      };
    case 'medium':
      return {
        ...current,
        qualityPreset: 'medium',
        resolutionScale: 1,
        shadowsEnabled: true,
        antialias: false,
      };
    case 'high':
      return {
        ...current,
        qualityPreset: 'high',
        resolutionScale: 1,
        shadowsEnabled: true,
        antialias: true,
      };
    case 'ultra':
      return {
        ...current,
        qualityPreset: 'ultra',
        resolutionScale: 1.25,
        shadowsEnabled: true,
        antialias: true,
      };
  }
}

export function loadGameSettings(): GameSettings {
  if (typeof window === 'undefined') {
    return structuredClone(DEFAULT_GAME_SETTINGS);
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_GAME_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<GameSettings>;

    const qualityPreset: QualityPreset =
      parsed.graphics?.qualityPreset &&
      ['low', 'medium', 'high', 'ultra'].includes(parsed.graphics.qualityPreset)
        ? parsed.graphics.qualityPreset
        : DEFAULT_GAME_SETTINGS.graphics.qualityPreset;

    const resolutionScale: ResolutionScale =
      parsed.graphics?.resolutionScale &&
      [0.75, 1, 1.25, 1.5].includes(parsed.graphics.resolutionScale)
        ? parsed.graphics.resolutionScale
        : DEFAULT_GAME_SETTINGS.graphics.resolutionScale;

    const fpsLimit: FpsLimit =
      typeof parsed.graphics?.fpsLimit === 'number' &&
      [0, 30, 60, 120].includes(parsed.graphics.fpsLimit)
        ? (parsed.graphics.fpsLimit as FpsLimit)
        : DEFAULT_GAME_SETTINGS.graphics.fpsLimit;

    const kb = parsed.controls?.keyBindings;
    const keyBindings: KeyBindings = {
      forward: typeof kb?.forward === 'string' ? kb.forward : DEFAULT_KEY_BINDINGS.forward,
      backward: typeof kb?.backward === 'string' ? kb.backward : DEFAULT_KEY_BINDINGS.backward,
      left: typeof kb?.left === 'string' ? kb.left : DEFAULT_KEY_BINDINGS.left,
      right: typeof kb?.right === 'string' ? kb.right : DEFAULT_KEY_BINDINGS.right,
      jump: typeof kb?.jump === 'string' ? kb.jump : DEFAULT_KEY_BINDINGS.jump,
      run: typeof kb?.run === 'string' ? kb.run : DEFAULT_KEY_BINDINGS.run,
      leftGrab: typeof kb?.leftGrab === 'string' ? kb.leftGrab : DEFAULT_KEY_BINDINGS.leftGrab,
      rightGrab: typeof kb?.rightGrab === 'string' ? kb.rightGrab : DEFAULT_KEY_BINDINGS.rightGrab,
      interact: typeof kb?.interact === 'string' ? kb.interact : DEFAULT_KEY_BINDINGS.interact,
      pause: typeof kb?.pause === 'string' ? kb.pause : DEFAULT_KEY_BINDINGS.pause,
    };

    return {
      graphics: {
        qualityPreset,
        resolutionScale,
        shadowsEnabled:
          typeof parsed.graphics?.shadowsEnabled === 'boolean'
            ? parsed.graphics.shadowsEnabled
            : DEFAULT_GAME_SETTINGS.graphics.shadowsEnabled,
        antialias:
          typeof parsed.graphics?.antialias === 'boolean'
            ? parsed.graphics.antialias
            : DEFAULT_GAME_SETTINGS.graphics.antialias,
        fpsLimit,
      },
      audio: {
        masterVolume:
          typeof parsed.audio?.masterVolume === 'number'
            ? clamp(parsed.audio.masterVolume, 0, 1)
            : DEFAULT_GAME_SETTINGS.audio.masterVolume,
        musicVolume:
          typeof parsed.audio?.musicVolume === 'number'
            ? clamp(parsed.audio.musicVolume, 0, 1)
            : DEFAULT_GAME_SETTINGS.audio.musicVolume,
        sfxVolume:
          typeof parsed.audio?.sfxVolume === 'number'
            ? clamp(parsed.audio.sfxVolume, 0, 1)
            : DEFAULT_GAME_SETTINGS.audio.sfxVolume,
        environmentVolume:
          typeof parsed.audio?.environmentVolume === 'number'
            ? clamp(parsed.audio.environmentVolume, 0, 1)
            : DEFAULT_GAME_SETTINGS.audio.environmentVolume,
        muted:
          typeof parsed.audio?.muted === 'boolean'
            ? parsed.audio.muted
            : DEFAULT_GAME_SETTINGS.audio.muted,
      },
      controls: {
        keyboardSensitivity:
          typeof parsed.controls?.keyboardSensitivity === 'number'
            ? clamp(parsed.controls.keyboardSensitivity, 0.5, 1.5)
            : DEFAULT_GAME_SETTINGS.controls.keyboardSensitivity,
        cameraSensitivity:
          typeof parsed.controls?.cameraSensitivity === 'number'
            ? clamp(parsed.controls.cameraSensitivity, 0.4, 2.2)
            : DEFAULT_GAME_SETTINGS.controls.cameraSensitivity,
        invertMouseY: Boolean(parsed.controls?.invertMouseY),
        keyBindings,
      },
      gameplay: {
        cameraDistance:
          typeof parsed.gameplay?.cameraDistance === 'number'
            ? clamp(parsed.gameplay.cameraDistance, 4.2, 9.5)
            : DEFAULT_GAME_SETTINGS.gameplay.cameraDistance,
        autoMantleAssist:
          typeof parsed.gameplay?.autoMantleAssist === 'boolean'
            ? parsed.gameplay.autoMantleAssist
            : DEFAULT_GAME_SETTINGS.gameplay.autoMantleAssist,
        showInteractionHints:
          typeof parsed.gameplay?.showInteractionHints === 'boolean'
            ? parsed.gameplay.showInteractionHints
            : DEFAULT_GAME_SETTINGS.gameplay.showInteractionHints,
      },
    };
  } catch {
    return structuredClone(DEFAULT_GAME_SETTINGS);
  }
}

export function saveGameSettings(settings: GameSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota or private-mode failures
  }
}

export function formatKeyCodeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  switch (code) {
    case 'Space':
      return 'Space';
    case 'ShiftLeft':
    case 'ShiftRight':
      return 'Shift';
    case 'ControlLeft':
    case 'ControlRight':
      return 'Ctrl';
    case 'AltLeft':
    case 'AltRight':
      return 'Alt';
    case 'Escape':
      return 'Esc';
    case 'Tab':
      return 'Tab';
    case 'Enter':
      return 'Enter';
    case 'ArrowUp':
      return 'Up';
    case 'ArrowDown':
      return 'Down';
    case 'ArrowLeft':
      return 'Left';
    case 'ArrowRight':
      return 'Right';
    default:
      return code;
  }
}
