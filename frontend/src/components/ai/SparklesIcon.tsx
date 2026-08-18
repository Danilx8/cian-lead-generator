import React from 'react';

/** Четырёхлучевые «искры» — маркер ИИ-фичи. */
const SparklesIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    aria-hidden
  >
    <path
      d="M12 3.5c.5 3.2 2.3 5 5.5 5.5-3.2.5-5 2.3-5.5 5.5-.5-3.2-2.3-5-5.5-5.5 3.2-.5 5-2.3 5.5-5.5z"
      fill="currentColor"
    />
    <path
      d="M18.5 13.5c.3 1.9 1.4 3 3.3 3.3-1.9.3-3 1.4-3.3 3.3-.3-1.9-1.4-3-3.3-3.3 1.9-.3 3-1.4 3.3-3.3z"
      fill="currentColor"
      opacity="0.75"
    />
    <path
      d="M6.5 14.5c.25 1.6 1.15 2.5 2.75 2.75-1.6.25-2.5 1.15-2.75 2.75-.25-1.6-1.15-2.5-2.75-2.75 1.6-.25 2.5-1.15 2.75-2.75z"
      fill="currentColor"
      opacity="0.55"
    />
  </svg>
);

export default SparklesIcon;
