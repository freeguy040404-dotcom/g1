import { LogOut, RotateCcw } from 'lucide-react';

interface QuitScreenProps {
  mode: 'confirm' | 'exited';
  onConfirmQuit: () => void;
  onCancelQuit: () => void;
  onRelaunch: () => void;
  onUiClick: () => void;
}

export function QuitScreen({
  mode,
  onConfirmQuit,
  onCancelQuit,
  onRelaunch,
  onUiClick,
}: QuitScreenProps) {
  if (mode === 'exited') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-[#d8ecf8] to-[#f4ece2] p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-900/12 bg-white p-8 text-center shadow-xl">
          <h1
            className="text-3xl font-bold tracking-tight text-slate-950"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Wobblepeak
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Your progress and settings have been saved safely to this browser. Thanks for playing!
          </p>
          <button
            type="button"
            onClick={() => {
              onUiClick();
              onRelaunch();
            }}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Relaunch Wobblepeak</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quit-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-900/12 bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-2.5 text-slate-900">
          <LogOut className="h-5 w-5 text-slate-600" aria-hidden="true" />
          <h2
            id="quit-title"
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Quit Wobblepeak?
          </h2>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          All unlocked worlds, relics, best times, and settings are already saved locally.
        </p>

        <div className="mt-6 flex gap-2.5">
          <button
            type="button"
            onClick={() => {
              onUiClick();
              onCancelQuit();
            }}
            className="flex-1 rounded-xl border border-slate-900/15 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100"
          >
            Stay in Menu
          </button>
          <button
            type="button"
            onClick={() => {
              onUiClick();
              onConfirmQuit();
            }}
            className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-red-600"
          >
            Quit Game
          </button>
        </div>
      </div>
    </div>
  );
}
