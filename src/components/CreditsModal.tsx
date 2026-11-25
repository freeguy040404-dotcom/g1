import { useEffect } from 'react';
import { Award, X } from 'lucide-react';

interface CreditsModalProps {
  onClose: () => void;
  onUiClick: () => void;
}

export function CreditsModal({ onClose, onUiClick }: CreditsModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const sections = [
    {
      role: 'Game Design & 3D Worlds',
      detail: 'Dream World, Warehouse, Mountain Adventure, Construction Site, Medieval Castle & Observatory Terrace',
    },
    {
      role: 'Physics & Character Dynamics',
      detail: 'Semi-wobbly upright stabilization, dual-hand grab/push/pull constraints, rope pendulums & ledge climbing powered by Cannon-es',
    },
    {
      role: 'Rendering & Procedural Craft',
      detail: 'Three.js WebGL2 PBR pipeline, instanced geometry, dynamic player-tracking shadows & procedural canvas textures',
    },
    {
      role: 'Procedural Sound & Ambient Music',
      detail: 'Real-time Web Audio API synthesizer with dynamic mixer and responsive physics acoustics',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credits-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-900/12 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-900/10 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Award className="h-5 w-5 text-blue-600" aria-hidden="true" />
            <h2
              id="credits-title"
              className="text-xl font-bold tracking-tight text-slate-950"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Credits
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              onUiClick();
              onClose();
            }}
            aria-label="Close credits"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-900/10 bg-slate-50 text-slate-700 hover:bg-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-4 px-6 py-5">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p
                className="text-2xl font-bold tracking-tight text-slate-950"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Wobblepeak
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                A sunlit 3D physics-based puzzle adventure
              </p>
            </div>
            <span className="text-xs font-semibold tabular-nums text-slate-500">v1.0.0</span>
          </div>

          <div className="divide-y divide-slate-900/8 border-y border-slate-900/8">
            {sections.map((section) => (
              <div key={section.role} className="py-3">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  {section.role}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-700">
                  {section.detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        <footer className="flex justify-end border-t border-slate-900/10 bg-slate-50/75 px-6 py-3.5">
          <button
            type="button"
            onClick={() => {
              onUiClick();
              onClose();
            }}
            className="rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-600"
          >
            Back to Main Menu
          </button>
        </footer>
      </div>
    </div>
  );
}
