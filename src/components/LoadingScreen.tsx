import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import type { LevelId } from '../game/types';
import { getLevelCatalogEntry } from '../game/levels/levelCatalog';
import { LevelArtwork } from './LevelArtwork';

interface LoadingScreenProps {
  visible: boolean;
  levelId: LevelId;
  progressPercent: number;
  stageLabel: string;
  errorMessage: string | null;
  onRetry: () => void;
  onReturnToMenu: () => void;
}

const WORLD_TIPS: Record<LevelId, string> = {
  'dream-world':
    'Stack wooden blocks or grab ledges directly with Left/Right Mouse and press Space to pull up.',
  warehouse:
    'Heavy cargo scales accept either one heavy metal crate or two wooden crates combined.',
  'mountain-adventure':
    'Roll heavy alpine boulders onto latching counterweight scales to raise summit bridges.',
  'construction-site':
    'Grab the hanging crane rope handles to swing across open gaps—or activate the side catwalk lever.',
  'medieval-castle':
    'Look closely along the west courtyard wall—pulling a loose crate aside reveals a hidden passage.',
  observatory:
    'Use Drop from Sky and Nudge Character to test Wobblepeak’s semi-wobbly physics balance.',
};

export function LoadingScreen({
  visible,
  levelId,
  progressPercent,
  stageLabel,
  errorMessage,
  onRetry,
  onReturnToMenu,
}: LoadingScreenProps) {
  const entry = getLevelCatalogEntry(levelId);
  const clamped = Math.min(100, Math.max(0, Math.round(progressPercent)));

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-[#e5f0f9] p-6 transition-opacity duration-250 ${
        visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-900/12 bg-white shadow-2xl">
        {/* Stylized World Artwork Banner */}
        <div className="relative aspect-[16/7.5] w-full overflow-hidden border-b border-slate-900/8">
          <LevelArtwork entry={entry} idPrefix="loading" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/65 via-slate-950/25 to-transparent px-6 pb-4 pt-10 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">
              {entry.isSandbox ? 'Bonus Sandbox' : `World ${entry.numberLabel}`}
            </p>
            <h2
              className="mt-0.5 text-2xl font-bold tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {entry.title}
            </h2>
          </div>
        </div>

        <div className="p-6">
          {errorMessage ? (
            <div>
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-red-900">
                    Could not load {entry.title}
                  </p>
                  <p className="mt-1 text-xs text-red-700">{errorMessage}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Retry Load</span>
                </button>
                <button
                  type="button"
                  onClick={onReturnToMenu}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-900/15 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  <Home className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Main Menu</span>
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                <span>{stageLabel}</span>
                <span className="tabular-nums text-blue-700">{clamped}%</span>
              </div>

              <div
                className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={clamped}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Level loading progress"
              >
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-150 ease-out"
                  style={{ width: `${clamped}%` }}
                />
              </div>

              <p className="mt-4 text-xs leading-relaxed text-slate-600">
                <strong className="font-semibold text-slate-800">Tip:</strong>{' '}
                {WORLD_TIPS[levelId]}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
