import type { LevelCatalogEntry } from '../game/types';

/**
 * Shared stylized architectural SVG diorama preview matching each level's 3D world & palette.
 */
export function LevelArtwork({
  entry,
  idPrefix = 'card',
}: {
  entry: LevelCatalogEntry;
  idPrefix?: string;
}) {
  const gradId = `sky-${idPrefix}-${entry.id}`;

  return (
    <svg
      viewBox="0 0 360 180"
      className="h-full w-full object-cover"
      role="img"
      aria-label={`${entry.title} world preview`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={entry.skyTopHex} />
          <stop offset="100%" stopColor={entry.skyBottomHex} />
        </linearGradient>
      </defs>
      <rect width="360" height="180" fill={`url(#${gradId})`} />

      {entry.id === 'dream-world' && (
        <>
          <circle cx="295" cy="42" r="20" fill="#fff8e1" opacity="0.92" />
          <ellipse cx="95" cy="48" rx="34" ry="11" fill="#ffffff" opacity="0.82" />
          <ellipse cx="222" cy="64" rx="26" ry="9" fill="#ffffff" opacity="0.72" />
          <polygon points="34,122 126,122 104,158 58,154" fill="#c7bfb4" />
          <rect x="30" y="114" width="100" height="12" rx="4" fill="#9bc996" />
          <rect x="52" y="100" width="14" height="14" fill="#e8957a" />
          <rect x="69" y="100" width="14" height="14" fill="#f3cf7a" />
          <rect x="60" y="87" width="14" height="13" fill="#8ea7d6" />
          <rect x="128" y="115" width="76" height="6" fill="#d9c6a3" />
          <polygon points="198,116 322,116 296,162 224,156" fill="#beb6aa" />
          <rect x="194" y="106" width="132" height="12" rx="4" fill="#8bc28c" />
          <rect x="234" y="72" width="8" height="34" fill="#f5efe6" />
          <rect x="276" y="72" width="8" height="34" fill="#f5efe6" />
          <rect x="228" y="65" width="62" height="9" rx="2" fill="#e6957c" />
          <circle cx="259" cy="88" r="7" fill="#34d399" opacity="0.9" />
        </>
      )}

      {entry.id === 'warehouse' && (
        <>
          <rect x="0" y="128" width="360" height="52" fill="#c9c4bb" />
          <polygon points="0,28 180,8 360,28 360,44 180,24 0,44" fill="#4b586e" />
          <rect x="52" y="28" width="56" height="10" fill="#eef6fc" opacity="0.7" />
          <rect x="152" y="18" width="56" height="10" fill="#eef6fc" opacity="0.7" />
          <rect x="252" y="28" width="56" height="10" fill="#eef6fc" opacity="0.7" />
          <rect x="26" y="54" width="6" height="78" fill="#d97706" />
          <rect x="86" y="54" width="6" height="78" fill="#d97706" />
          <rect x="26" y="84" width="66" height="5" fill="#d97706" />
          <rect x="26" y="110" width="66" height="5" fill="#d97706" />
          <rect x="38" y="67" width="18" height="17" fill="#c8925a" stroke="#8b5e34" strokeWidth="1.5" />
          <rect x="60" y="93" width="18" height="17" fill="#c8925a" stroke="#8b5e34" strokeWidth="1.5" />
          <rect x="128" y="108" width="24" height="24" fill="#64748b" stroke="#334155" strokeWidth="2" />
          <rect x="128" y="118" width="24" height="4" fill="#f59e0b" />
          <rect x="172" y="124" width="44" height="6" fill="#10b981" />
          <rect x="242" y="54" width="82" height="78" fill="#475569" />
          <rect x="250" y="62" width="66" height="68" fill="#94a3b8" />
          <line x1="250" y1="80" x2="316" y2="80" stroke="#475569" strokeWidth="2" />
          <line x1="250" y1="98" x2="316" y2="98" stroke="#475569" strokeWidth="2" />
          <line x1="250" y1="116" x2="316" y2="116" stroke="#475569" strokeWidth="2" />
        </>
      )}

      {entry.id === 'mountain-adventure' && (
        <>
          <circle cx="64" cy="40" r="18" fill="#fff9e8" opacity="0.9" />
          <polygon points="10,160 88,52 162,160" fill="#8fa8c4" />
          <polygon points="88,52 72,76 86,72 102,78" fill="#f5f8fc" />
          <polygon points="172,160 258,38 348,160" fill="#7c96b4" />
          <polygon points="258,38 238,68 256,62 276,70" fill="#f8fbff" />
          <polygon points="0,104 114,104 130,180 0,180" fill="#8b857c" />
          <polygon points="236,92 360,92 360,180 220,180" fill="#7d776f" />
          <rect x="112" y="102" width="126" height="7" fill="#a97448" />
          <line x1="128" y1="102" x2="128" y2="86" stroke="#6f4b2f" strokeWidth="3" />
          <line x1="220" y1="102" x2="220" y2="86" stroke="#6f4b2f" strokeWidth="3" />
          <path d="M 128 88 Q 174 96 220 88" stroke="#8b5e3c" strokeWidth="2" fill="none" />
          <circle cx="282" cy="82" r="12" fill="#949088" stroke="#6b6760" strokeWidth="1.5" />
          <polygon points="48,104 58,72 68,104" fill="#4f8368" />
          <polygon points="318,92 329,56 340,92" fill="#3f7058" />
        </>
      )}

      {entry.id === 'construction-site' && (
        <>
          <circle cx="298" cy="68" r="22" fill="#ffe6b5" opacity="0.92" />
          <rect x="20" y="96" width="32" height="84" fill="#b49e92" opacity="0.65" />
          <rect x="64" y="78" width="40" height="102" fill="#a89388" opacity="0.65" />
          <rect x="272" y="88" width="38" height="92" fill="#a89388" opacity="0.65" />
          <rect x="228" y="34" width="10" height="136" fill="#eab308" />
          <rect x="112" y="34" width="184" height="9" fill="#eab308" />
          <line x1="233" y1="22" x2="128" y2="34" stroke="#92400e" strokeWidth="2" />
          <line x1="233" y1="22" x2="288" y2="34" stroke="#92400e" strokeWidth="2" />
          <line x1="158" y1="43" x2="174" y2="104" stroke="#d4a36a" strokeWidth="2.5" />
          <rect x="166" y="102" width="16" height="16" rx="2" fill="#ea580c" />
          <rect x="28" y="120" width="96" height="12" fill="#94a3b8" />
          <rect x="208" y="112" width="114" height="12" fill="#94a3b8" />
          <line x1="42" y1="132" x2="42" y2="180" stroke="#2563eb" strokeWidth="4" />
          <line x1="108" y1="132" x2="108" y2="180" stroke="#2563eb" strokeWidth="4" />
          <line x1="42" y1="134" x2="108" y2="174" stroke="#3b82f6" strokeWidth="2" />
          <line x1="108" y1="134" x2="42" y2="174" stroke="#3b82f6" strokeWidth="2" />
        </>
      )}

      {entry.id === 'medieval-castle' && (
        <>
          <circle cx="288" cy="40" r="18" fill="#fff2d4" opacity="0.9" />
          <rect x="0" y="142" width="360" height="38" fill="#5b9bd5" opacity="0.72" />
          <rect x="110" y="130" width="250" height="50" fill="#7fa878" />
          <rect x="148" y="54" width="38" height="86" fill="#d4ccc0" />
          <polygon points="144,54 167,26 190,54" fill="#6d4c9c" />
          <rect x="262" y="46" width="44" height="94" fill="#cfc6b8" />
          <polygon points="258,46 284,16 310,46" fill="#6d4c9c" />
          <rect x="184" y="76" width="80" height="64" fill="#ddd5c8" />
          <rect x="186" y="68" width="12" height="10" fill="#ddd5c8" />
          <rect x="206" y="68" width="12" height="10" fill="#ddd5c8" />
          <rect x="226" y="68" width="12" height="10" fill="#ddd5c8" />
          <rect x="246" y="68" width="12" height="10" fill="#ddd5c8" />
          <path d="M 206 140 L 206 106 A 18 18 0 0 1 242 106 L 242 140 Z" fill="#334155" />
          <line x1="214" y1="96" x2="214" y2="140" stroke="#94a3b8" strokeWidth="2" />
          <line x1="224" y1="90" x2="224" y2="140" stroke="#94a3b8" strokeWidth="2" />
          <line x1="234" y1="96" x2="234" y2="140" stroke="#94a3b8" strokeWidth="2" />
          <rect x="74" y="136" width="82" height="8" fill="#8b5e34" />
          <rect x="0" y="134" width="76" height="46" fill="#8fb588" />
          <polygon points="167,62 167,82 175,77 175,62" fill="#7c3aed" />
          <polygon points="284,56 284,78 293,72 293,56" fill="#7c3aed" />
        </>
      )}

      {entry.id === 'observatory' && (
        <>
          <circle cx="290" cy="42" r="18" fill="#fff8e1" opacity="0.9" />
          <polygon points="0,156 96,94 188,156" fill="#a8bed6" opacity="0.7" />
          <polygon points="162,156 266,86 360,156" fill="#9bb4ce" opacity="0.75" />
          <rect x="34" y="124" width="292" height="56" rx="4" fill="#ece6dc" />
          <rect x="34" y="118" width="292" height="8" fill="#e6957c" />
          <path d="M 196 118 A 42 42 0 0 1 280 118 Z" fill="#8fa8d6" />
          <rect x="234" y="76" width="8" height="42" fill="#3b4456" />
          <circle cx="238" cy="74" r="5" fill="#dcc07b" />
          <rect x="84" y="100" width="18" height="18" fill="#e8957a" />
          <rect x="104" y="100" width="18" height="18" fill="#f3cf7a" />
          <rect x="94" y="82" width="18" height="18" fill="#8ea7d6" />
        </>
      )}
    </svg>
  );
}
