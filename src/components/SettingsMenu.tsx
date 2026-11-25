import { useEffect, useState } from 'react';
import {
  Gamepad2,
  Keyboard,
  Maximize2,
  Minimize2,
  Monitor,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  applyQualityPresetValues,
  DEFAULT_GAME_SETTINGS,
  DEFAULT_KEY_BINDINGS,
  formatKeyCodeLabel,
  type FpsLimit,
  type GameSettings,
  type KeyBindings,
  type QualityPreset,
  type ResolutionScale,
} from '../game/settings';

type SettingsTab = 'graphics' | 'audio' | 'controls' | 'gameplay';

interface SettingsMenuProps {
  settings: GameSettings;
  onUpdateSettings: (next: GameSettings) => void;
  onTestAudio: () => void;
  onClose: () => void;
  onUiClick: () => void;
}

const KEY_BINDING_ROWS: Array<{ field: keyof KeyBindings; label: string }> = [
  { field: 'forward', label: 'Move Forward' },
  { field: 'backward', label: 'Move Backward' },
  { field: 'left', label: 'Move Left' },
  { field: 'right', label: 'Move Right' },
  { field: 'jump', label: 'Jump / Pull Up' },
  { field: 'run', label: 'Sprint / Run' },
  { field: 'leftGrab', label: 'Left Hand Grab' },
  { field: 'rightGrab', label: 'Right Hand Grab' },
  { field: 'interact', label: 'Flip Lever / Interact' },
  { field: 'pause', label: 'Pause Menu' },
];

export function SettingsMenu({
  settings,
  onUpdateSettings,
  onTestAudio,
  onClose,
  onUiClick,
}: SettingsMenuProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('graphics');
  const [rebindingField, setRebindingField] = useState<keyof KeyBindings | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false,
  );
  const [fullscreenNote, setFullscreenNote] = useState<string | null>(null);
  const [initialAntialias] = useState<boolean>(settings.graphics.antialias);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    if (!rebindingField) {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      };
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }

    const handleCapture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape' && rebindingField !== 'pause') {
        setRebindingField(null);
        return;
      }
      onUpdateSettings({
        ...settings,
        controls: {
          ...settings.controls,
          keyBindings: {
            ...settings.controls.keyBindings,
            [rebindingField]: e.code,
          },
        },
      });
      setRebindingField(null);
      onUiClick();
    };

    window.addEventListener('keydown', handleCapture, true);
    return () => window.removeEventListener('keydown', handleCapture, true);
  }, [rebindingField, settings, onUpdateSettings, onClose, onUiClick]);

  const handleToggleFullscreen = async () => {
    onUiClick();
    setFullscreenNote(null);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else {
        setFullscreenNote('Fullscreen is not supported by this browser.');
      }
    } catch {
      setFullscreenNote('Fullscreen was blocked by the browser or embedded frame.');
    }
  };

  const handleResetDefaults = () => {
    onUiClick();
    onUpdateSettings(structuredClone(DEFAULT_GAME_SETTINGS));
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Monitor }> = [
    { id: 'graphics', label: 'Graphics', icon: Monitor },
    { id: 'audio', label: 'Audio', icon: Volume2 },
    { id: 'controls', label: 'Controls', icon: Keyboard },
    { id: 'gameplay', label: 'Gameplay', icon: Gamepad2 },
  ];

  const antialiasChanged = settings.graphics.antialias !== initialAntialias;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-900/12 bg-white shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-900/10 px-6 py-4">
          <div>
            <h2
              id="settings-title"
              className="text-xl font-bold tracking-tight text-slate-950"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Settings
            </h2>
            <p className="text-xs text-slate-500">
              Changes apply immediately and save automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onUiClick();
              onClose();
            }}
            aria-label="Close settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-900/10 bg-slate-50 text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {/* Category Tabs */}
        <nav
          aria-label="Settings categories"
          className="flex flex-wrap gap-1 border-b border-slate-900/10 bg-slate-50/80 px-6 py-2.5"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  onUiClick();
                  setRebindingField(null);
                  setActiveTab(tab.id);
                }}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  active
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-white hover:text-slate-950'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'graphics' && (
            <div className="space-y-5">
              {/* Quality Preset */}
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Quality Preset</p>
                  <p className="text-xs text-slate-500">
                    Balances shadow resolution, pixel scale, and reflections.
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {(['low', 'medium', 'high', 'ultra'] as QualityPreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        onUiClick();
                        onUpdateSettings({
                          ...settings,
                          graphics: applyQualityPresetValues(preset, settings.graphics),
                        });
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                        settings.graphics.qualityPreset === preset
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-900/12 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution Scale */}
              <div className="flex flex-col justify-between gap-2 border-t border-slate-900/8 pt-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Render Resolution</p>
                  <p className="text-xs text-slate-500">
                    Adjusts WebGL canvas pixel density scale live.
                  </p>
                </div>
                <div className="flex gap-1.5 tabular-nums">
                  {([0.75, 1, 1.25, 1.5] as ResolutionScale[]).map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      onClick={() => {
                        onUiClick();
                        onUpdateSettings({
                          ...settings,
                          graphics: { ...settings.graphics, resolutionScale: scale },
                        });
                      }}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        settings.graphics.resolutionScale === scale
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-900/12 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {Math.round(scale * 100)}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Display Mode (Fullscreen / Windowed) */}
              <div className="flex flex-col justify-between gap-2 border-t border-slate-900/8 pt-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Display Mode</p>
                  <p className="text-xs text-slate-500">
                    Switch between fullscreen and windowed display.
                  </p>
                  {fullscreenNote && (
                    <p className="mt-1 text-xs font-medium text-amber-700">{fullscreenNote}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-900/15 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 sm:self-center"
                >
                  {isFullscreen ? (
                    <>
                      <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Switch to Windowed</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Enter Fullscreen</span>
                    </>
                  )}
                </button>
              </div>

              {/* Shadows Toggle */}
              <div className="flex items-center justify-between gap-4 border-t border-slate-900/8 pt-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Dynamic Shadows</p>
                  <p className="text-xs text-slate-500">
                    Soft directional sunlight shadows across structures and blocks.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.graphics.shadowsEnabled}
                  onClick={() => {
                    onUiClick();
                    onUpdateSettings({
                      ...settings,
                      graphics: {
                        ...settings.graphics,
                        shadowsEnabled: !settings.graphics.shadowsEnabled,
                      },
                    });
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    settings.graphics.shadowsEnabled ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                      settings.graphics.shadowsEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Anti-Aliasing Toggle */}
              <div className="flex items-center justify-between gap-4 border-t border-slate-900/8 pt-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Anti-Aliasing (MSAA)</p>
                  <p className="text-xs text-slate-500">
                    Smooths geometric edges on hardware-accelerated WebGL2 devices.
                  </p>
                  {antialiasChanged && (
                    <p className="mt-1 text-[11px] font-medium text-blue-700">
                      Saved — reloads WebGL context on next page refresh.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.graphics.antialias}
                  onClick={() => {
                    onUiClick();
                    onUpdateSettings({
                      ...settings,
                      graphics: {
                        ...settings.graphics,
                        antialias: !settings.graphics.antialias,
                      },
                    });
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    settings.graphics.antialias ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                      settings.graphics.antialias ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Frame-Rate Limit */}
              <div className="flex flex-col justify-between gap-2 border-t border-slate-900/8 pt-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Frame-Rate Limit</p>
                  <p className="text-xs text-slate-500">
                    Caps maximum render cadence to conserve battery or thermals.
                  </p>
                </div>
                <div className="flex gap-1.5 tabular-nums">
                  {([0, 30, 60, 120] as FpsLimit[]).map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      onClick={() => {
                        onUiClick();
                        onUpdateSettings({
                          ...settings,
                          graphics: { ...settings.graphics, fpsLimit: fps },
                        });
                      }}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        settings.graphics.fpsLimit === fps
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-900/12 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {fps === 0 ? 'Max' : `${fps}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-5">
              {/* Master Mute Toggle */}
              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-900/10 bg-slate-50/80 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      settings.audio.muted
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {settings.audio.muted ? (
                      <VolumeX className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Volume2 className="h-4 w-4" aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Mute All Audio</p>
                    <p className="text-xs text-slate-500">
                      Instantly silences music, sound effects, and world ambience.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.audio.muted}
                  onClick={() => {
                    onUiClick();
                    onUpdateSettings({
                      ...settings,
                      audio: {
                        ...settings.audio,
                        muted: !settings.audio.muted,
                      },
                    });
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    settings.audio.muted ? 'bg-rose-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                      settings.audio.muted ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className={settings.audio.muted ? 'space-y-5 opacity-55 transition-opacity' : 'space-y-5 transition-opacity'}>
                {[
                  {
                    key: 'masterVolume' as const,
                    label: 'Master Volume',
                    desc: 'Overall output level for music, sound effects, and ambience.',
                  },
                  {
                    key: 'musicVolume' as const,
                    label: 'Music Volume',
                    desc: 'Crossfading per-world procedural background themes.',
                  },
                  {
                    key: 'sfxVolume' as const,
                    label: 'Sound Effects Volume',
                    desc: 'Footsteps, collisions, grabs, throws, levers, and doors.',
                  },
                  {
                    key: 'environmentVolume' as const,
                    label: 'Environmental Audio Volume',
                    desc: 'Biome winds, warehouse machinery hum, and castle hall drafts.',
                  },
                ].map((item, index) => {
                  const pct = Math.round(settings.audio[item.key] * 100);
                  return (
                    <div
                      key={item.key}
                      className={index > 0 ? 'border-t border-slate-900/8 pt-4' : ''}
                    >
                      <div className="flex items-baseline justify-between">
                        <div>
                          <label
                            htmlFor={`slider-${item.key}`}
                            className="text-sm font-semibold text-slate-900"
                          >
                            {item.label}
                          </label>
                          <p className="text-xs text-slate-500">{item.desc}</p>
                        </div>
                        <span className="text-xs font-bold text-slate-800 tabular-nums">
                          {pct}%
                        </span>
                      </div>
                      <input
                        id={`slider-${item.key}`}
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={pct}
                        onChange={(e) => {
                          const val = Number(e.target.value) / 100;
                          onUpdateSettings({
                            ...settings,
                            audio: {
                              ...settings.audio,
                              [item.key]: val,
                            },
                          });
                        }}
                        className="mt-2.5 h-2 w-full cursor-pointer accent-blue-600"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-slate-900/8 pt-4">
                <p className="text-xs text-slate-500">
                  {settings.audio.muted
                    ? 'Audio is currently muted.'
                    : 'Spatial 3D audio and dynamic collision scaling active.'}
                </p>
                <button
                  type="button"
                  onClick={onTestAudio}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900/15 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100"
                >
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Play Test Chime</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'controls' && (
            <div className="space-y-5">
              {/* Keyboard Sensitivity */}
              <div>
                <div className="flex items-baseline justify-between">
                  <div>
                    <label
                      htmlFor="slider-kb-sens"
                      className="text-sm font-semibold text-slate-900"
                    >
                      Keyboard Sensitivity
                    </label>
                    <p className="text-xs text-slate-500">
                      Lower values soften ledge creeping; higher values give instant response.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-slate-800 tabular-nums">
                    {Math.round(settings.controls.keyboardSensitivity * 100)}%
                  </span>
                </div>
                <input
                  id="slider-kb-sens"
                  type="range"
                  min={50}
                  max={150}
                  step={5}
                  value={Math.round(settings.controls.keyboardSensitivity * 100)}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      controls: {
                        ...settings.controls,
                        keyboardSensitivity: Number(e.target.value) / 100,
                      },
                    })
                  }
                  className="mt-2 h-2 w-full cursor-pointer accent-blue-600"
                />
              </div>

              {/* Camera Sensitivity */}
              <div className="border-t border-slate-900/8 pt-4">
                <div className="flex items-baseline justify-between">
                  <div>
                    <label
                      htmlFor="slider-cam-sens-ctrl"
                      className="text-sm font-semibold text-slate-900"
                    >
                      Camera Sensitivity
                    </label>
                    <p className="text-xs text-slate-500">
                      Mouse orbit speed in locked-camera and drag-orbit modes.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-slate-800 tabular-nums">
                    {settings.controls.cameraSensitivity.toFixed(1)}x
                  </span>
                </div>
                <input
                  id="slider-cam-sens-ctrl"
                  type="range"
                  min={40}
                  max={220}
                  step={10}
                  value={Math.round(settings.controls.cameraSensitivity * 100)}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      controls: {
                        ...settings.controls,
                        cameraSensitivity: Number(e.target.value) / 100,
                      },
                    })
                  }
                  className="mt-2 h-2 w-full cursor-pointer accent-blue-600"
                />
              </div>

              {/* Invert Mouse Y */}
              <div className="flex items-center justify-between gap-4 border-t border-slate-900/8 pt-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Invert Mouse Y-Axis</p>
                  <p className="text-xs text-slate-500">
                    Reverses vertical camera tilt direction.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.controls.invertMouseY}
                  onClick={() => {
                    onUiClick();
                    onUpdateSettings({
                      ...settings,
                      controls: {
                        ...settings.controls,
                        invertMouseY: !settings.controls.invertMouseY,
                      },
                    });
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    settings.controls.invertMouseY ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                      settings.controls.invertMouseY ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Configurable Key Bindings */}
              <div className="border-t border-slate-900/8 pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Key Bindings</p>
                    <p className="text-xs text-slate-500">
                      Click any binding, then press a key to assign it.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onUiClick();
                      setRebindingField(null);
                      onUpdateSettings({
                        ...settings,
                        controls: {
                          ...settings.controls,
                          keyBindings: { ...DEFAULT_KEY_BINDINGS },
                        },
                      });
                    }}
                    className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                  >
                    Reset Keys
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {KEY_BINDING_ROWS.map((row) => {
                    const isListening = rebindingField === row.field;
                    const keyLabel = formatKeyCodeLabel(
                      settings.controls.keyBindings[row.field],
                    );
                    return (
                      <div
                        key={row.field}
                        className="flex items-center justify-between rounded-lg border border-slate-900/10 bg-slate-50/75 px-3 py-2"
                      >
                        <span className="text-xs font-medium text-slate-700">
                          {row.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onUiClick();
                            setRebindingField(isListening ? null : row.field);
                          }}
                          className={`min-w-[4.5rem] rounded-md border px-2.5 py-1 text-center text-xs font-bold transition-colors ${
                            isListening
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-900/15 bg-white text-slate-900 hover:border-blue-500'
                          }`}
                        >
                          {isListening ? 'Press key...' : keyLabel}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'gameplay' && (
            <div className="space-y-5">
              {/* Camera Distance */}
              <div>
                <div className="flex items-baseline justify-between">
                  <div>
                    <label
                      htmlFor="slider-cam-dist"
                      className="text-sm font-semibold text-slate-900"
                    >
                      Camera Follow Distance
                    </label>
                    <p className="text-xs text-slate-500">
                      Default third-person framing distance behind the character.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-slate-800 tabular-nums">
                    {settings.gameplay.cameraDistance.toFixed(1)} m
                  </span>
                </div>
                <input
                  id="slider-cam-dist"
                  type="range"
                  min={42}
                  max={95}
                  step={2}
                  value={Math.round(settings.gameplay.cameraDistance * 10)}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      gameplay: {
                        ...settings.gameplay,
                        cameraDistance: Number(e.target.value) / 10,
                      },
                    })
                  }
                  className="mt-2 h-2 w-full cursor-pointer accent-blue-600"
                />
              </div>

              {/* Camera Sensitivity Mirror */}
              <div className="border-t border-slate-900/8 pt-4">
                <div className="flex items-baseline justify-between">
                  <div>
                    <label
                      htmlFor="slider-cam-sens-gp"
                      className="text-sm font-semibold text-slate-900"
                    >
                      Camera Sensitivity
                    </label>
                    <p className="text-xs text-slate-500">
                      Synced with Controls camera look speed.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-slate-800 tabular-nums">
                    {settings.controls.cameraSensitivity.toFixed(1)}x
                  </span>
                </div>
                <input
                  id="slider-cam-sens-gp"
                  type="range"
                  min={40}
                  max={220}
                  step={10}
                  value={Math.round(settings.controls.cameraSensitivity * 100)}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      controls: {
                        ...settings.controls,
                        cameraSensitivity: Number(e.target.value) / 100,
                      },
                    })
                  }
                  className="mt-2 h-2 w-full cursor-pointer accent-blue-600"
                />
              </div>

              {/* Grab & Climb Reach Assist */}
              <div className="flex items-center justify-between gap-4 border-t border-slate-900/8 pt-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Grab &amp; Ledge Reach Assist
                  </p>
                  <p className="text-xs text-slate-500">
                    Adds forgiving reach extension when grabbing blocks, ropes, and cliff ledges.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.gameplay.autoMantleAssist}
                  onClick={() => {
                    onUiClick();
                    onUpdateSettings({
                      ...settings,
                      gameplay: {
                        ...settings.gameplay,
                        autoMantleAssist: !settings.gameplay.autoMantleAssist,
                      },
                    });
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    settings.gameplay.autoMantleAssist ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                      settings.gameplay.autoMantleAssist ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Show Interaction Hints */}
              <div className="flex items-center justify-between gap-4 border-t border-slate-900/8 pt-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Show Interaction Hints
                  </p>
                  <p className="text-xs text-slate-500">
                    Displays subtle reach, lever, and ledge prompts in the HUD.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.gameplay.showInteractionHints}
                  onClick={() => {
                    onUiClick();
                    onUpdateSettings({
                      ...settings,
                      gameplay: {
                        ...settings.gameplay,
                        showInteractionHints: !settings.gameplay.showInteractionHints,
                      },
                    });
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    settings.gameplay.showInteractionHints ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                      settings.gameplay.showInteractionHints ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-900/10 bg-slate-50/75 px-6 py-3.5">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900/12 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onUiClick();
              onClose();
            }}
            className="rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
