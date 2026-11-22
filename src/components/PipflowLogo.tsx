import React from 'react';

interface PipflowLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  onClick?: () => void;
  className?: string;
}

export const PipflowLogo: React.FC<PipflowLogoProps> = ({
  size = 'md',
  showText = true,
  onClick,
  className = '',
}) => {
  const iconDim = size === 'sm' ? 34 : size === 'lg' ? 54 : 40;
  const textSize =
    size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 text-left select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00C8FF] rounded-lg ${className}`}
      aria-label="Pipflowtrade.site"
    >
      <svg
        width={iconDim}
        height={iconDim}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <defs>
          <radialGradient id="pf-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0D1E14" />
            <stop offset="75%" stopColor="#050914" />
            <stop offset="100%" stopColor="#030711" />
          </radialGradient>
          <filter id="pf-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Circular badge base & neon green ring */}
        <circle cx="60" cy="60" r="56" fill="url(#pf-bg)" stroke="#20F000" strokeWidth="3.5" />
        <circle cx="60" cy="60" r="50" stroke="#20F000" strokeOpacity="0.28" strokeWidth="1" />

        {/* Candlestick background cluster (neon green bullish + red bearish accents) */}
        <g opacity="0.92">
          {/* Candle 1 - Red accent */}
          <line x1="25" y1="56" x2="25" y2="86" stroke="#FF1744" strokeWidth="2" />
          <rect x="21.5" y="64" width="7" height="14" rx="1" fill="#FF1744" />

          {/* Candle 2 - Green */}
          <line x1="38" y1="48" x2="38" y2="84" stroke="#20F000" strokeWidth="2" />
          <rect x="34.5" y="54" width="7" height="20" rx="1" fill="#20F000" />

          {/* Candle 3 - Red accent */}
          <line x1="51" y1="44" x2="51" y2="76" stroke="#FF1744" strokeWidth="2" />
          <rect x="47.5" y="50" width="7" height="15" rx="1" fill="#FF1744" />

          {/* Candle 4 - Green */}
          <line x1="65" y1="36" x2="65" y2="72" stroke="#20F000" strokeWidth="2" />
          <rect x="61.5" y="42" width="7" height="21" rx="1" fill="#20F000" />

          {/* Candle 5 - Green */}
          <line x1="79" y1="28" x2="79" y2="66" stroke="#20F000" strokeWidth="2" />
          <rect x="75.5" y="34" width="7" height="22" rx="1" fill="#20F000" />

          {/* Candle 6 - Bright upward breakout */}
          <line x1="93" y1="20" x2="93" y2="56" stroke="#20F000" strokeWidth="2" />
          <rect x="89.5" y="25" width="7" height="22" rx="1" fill="#20F000" />
        </g>

        {/* Charging Bull Illustration (neon green silhouette + red eye accent) */}
        <g filter="url(#pf-glow)">
          <path
            d="M32 75 C36 62, 46 53, 59 50 C63 45, 67 37, 63 29 C69 32, 74 38, 75 45 C80 43, 86 38, 88 30 C92 38, 89 47, 81 52 C85 56, 87 63, 84 69 L77 67 L73 74 L83 78 L80 86 L67 82 L63 89 L46 89 L49 78 L36 81 Z"
            fill="#07150C"
            stroke="#20F000"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          {/* Bull Horns highlight */}
          <path
            d="M63 29 C67 35, 67 42, 62 47"
            stroke="#20F000"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M88 30 C89 37, 85 44, 79 48"
            stroke="#20F000"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Red bullish eye accent */}
          <circle cx="77" cy="56" r="2.2" fill="#FF1744" />
        </g>

        {/* Upward trend line */}
        <path
          d="M22 86 L46 72 L66 58 L95 28"
          stroke="#20F000"
          strokeWidth="2"
          strokeLinecap="round"
          strokeOpacity="0.65"
        />
      </svg>

      {showText && (
        <span className={`font-display font-bold tracking-tight whitespace-nowrap shrink-0 ${textSize}`}>
          <span className="text-white">Pipflow</span>
          <span className="text-[#00C8FF]">trade</span>
          <span className="text-[#FF1744]">.</span>
          <span className="text-white">site</span>
        </span>
      )}
    </button>
  );
};
