import React from 'react';
import { useTheme } from '../../theme';

// The ORIGIN wordmark (or the full lockup with "Street culture ·
// Visakhapatnam · Estd 2026"), cut from the brand artwork in public/brand.
//   tone 'theme'  black in the black & white theme, red in the red theme
//   tone 'white'  on the accent-coloured menu
//   tone 'black'  always black
type Tone = 'theme' | 'white' | 'black';

const RATIO = { wordmark: 809 / 199, lockup: 809 / 374 };

export const BrandLogo: React.FC<{
  kind?: 'wordmark' | 'lockup';
  tone?: Tone;
  // Height in px; the width follows the artwork.
  height: number;
  className?: string;
}> = ({ kind = 'wordmark', tone = 'theme', height, className }) => {
  const theme = useTheme();
  const colour = tone === 'theme' ? (theme === 'red' ? 'red' : 'black') : tone;
  return (
    <img
      src={`/brand/origin-${kind}-${colour}.png`}
      alt="Origin"
      height={height}
      width={Math.round(height * RATIO[kind])}
      className={className}
      style={{ height, width: 'auto' }}
      draggable={false}
    />
  );
};
