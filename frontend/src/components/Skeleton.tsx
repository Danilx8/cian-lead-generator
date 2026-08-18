import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave';
}

const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse'
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'text':
        return 'h-4 rounded-md';
      case 'circular':
        return 'rounded-full';
      case 'rectangular':
      default:
        return 'rounded-lg';
    }
  };

  const getAnimationClass = () => {
    switch (animation) {
      case 'wave':
        return 'animate-wave';
      case 'pulse':
      default:
        return 'animate-pulse';
    }
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`bg-gray-600/30 ${getVariantStyles()} ${getAnimationClass()} ${className}`}
      style={style}
    />
  );
};

export default Skeleton;