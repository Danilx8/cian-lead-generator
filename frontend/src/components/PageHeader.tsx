import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

interface PageHeaderProps {
  title: string;
  backTo?: string;
  backLabel?: string;
  onBack?: () => void;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  children?: React.ReactNode;
}

const SPRING_TAP = { type: 'spring' as const, stiffness: 500, damping: 25 };

const glassBackStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.6)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
};

const ChevronLeft: React.FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M15 18l-6-6 6-6"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const GlassBackButton: React.FC<{
  label: string;
  onClick?: () => void;
  to?: string;
}> = ({ label, onClick, to }) => {
  /* Fixed-size wrapper prevents scale from shifting layout */
  const wrapper = "absolute left-0 top-0 bottom-0 flex items-center";
  const btnCls = "w-9 h-9 rounded-full flex items-center justify-center text-white glass-border-light";

  if (to) {
    return (
      <div className={wrapper}>
        <motion.div whileTap={{ scale: 0.9 }} transition={SPRING_TAP}>
          <Link to={to} aria-label={label} className={btnCls} style={glassBackStyle}>
            <ChevronLeft />
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={wrapper}>
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.9 }}
        transition={SPRING_TAP}
        aria-label={label}
        className={btnCls}
        style={glassBackStyle}
      >
        <ChevronLeft />
      </motion.button>
    </div>
  );
};

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  backTo,
  backLabel = 'Назад',
  onBack,
  leftElement,
  rightElement,
  children,
}) => {
  return (
    <div
      className="sticky top-0 z-40 bg-lighter-black/95 backdrop-blur-md px-4 pb-3"
      style={{
        borderBottom: '0.5px solid rgba(11,36,48,0.10)',
        paddingTop: 'max(var(--safe-area-inset-top, 0px), 8px)',
      }}
    >
      <div className="relative w-full flex items-center justify-center min-h-[36px]">
        {leftElement ? (
          <div className="absolute left-0 top-1/2 -translate-y-1/2">{leftElement}</div>
        ) : onBack ? (
          <GlassBackButton label={backLabel} onClick={onBack} />
        ) : backTo ? (
          <GlassBackButton label={backLabel} to={backTo} />
        ) : null}
        <h1 className="text-white text-[17px] font-semibold truncate max-w-[60%] text-center leading-snug">
          {title}
        </h1>
        {rightElement && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            {rightElement}
          </div>
        )}
      </div>
      {children}
    </div>
  );
};

export default PageHeader;
