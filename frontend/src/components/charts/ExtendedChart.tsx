import React, { useState, useMemo, useCallback, useEffect, memo, useRef } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import Skeleton from '../Skeleton';
import AnimatedDigit from './AnimatedDigit';
import type { TelegramWA } from '../../types/telegram';

interface WindowWithTG extends Window {
  Telegram?: {
    WebApp?: TelegramWA
  }
}

interface ExtendedChartProps {
  changePercent: string;
  isPositive?: boolean;
  isLoading?: boolean;
}

const ExtendedChart: React.FC<ExtendedChartProps> = memo(({
  changePercent,
  isPositive = true,
  isLoading = false
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [selectedOption, setSelectedOption] = useState<'conversion' | 'engagement'>('conversion');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isTouching, setIsTouching] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const lastHapticIndexRef = useRef<number | null>(null);

  const conversionData = useMemo(() => [
    { time: '00:00', value: 0.12 },
    { time: '01:00', value: 0.08 },
    { time: '02:00', value: 0.15 },
    { time: '03:00', value: 0.23 },
    { time: '04:00', value: 0.31 },
    { time: '05:00', value: 0.18 },
    { time: '06:00', value: 0.42 },
    { time: '07:00', value: 0.35 },
    { time: '08:00', value: 0.29 },
    { time: '09:00', value: 0.47 },
    { time: '10:00', value: 0.38 },
    { time: '11:00', value: 0.52 },
    { time: '12:00', value: 0.61 },
    { time: '13:00', value: 0.45 },
    { time: '14:00', value: 0.73 },
    { time: '15:00', value: 0.68 },
    { time: '16:00', value: 0.84 },
    { time: '17:00', value: 0.92 },
    { time: '18:00', value: 0.76 },
    { time: '19:00', value: 0.89 },
    { time: '20:00', value: 0.95 },
    { time: '21:00', value: 1.03 },
    { time: '22:00', value: 1.18 },
    { time: '23:00', value: 1.27 }
  ], []);

  const engagementData = useMemo(() => [
    { time: '00:00', value: 0.05 },
    { time: '01:00', value: 0.03 },
    { time: '02:00', value: 0.07 },
    { time: '03:00', value: 0.12 },
    { time: '04:00', value: 0.18 },
    { time: '05:00', value: 0.09 },
    { time: '06:00', value: 0.25 },
    { time: '07:00', value: 0.21 },
    { time: '08:00', value: 0.16 },
    { time: '09:00', value: 0.28 },
    { time: '10:00', value: 0.22 },
    { time: '11:00', value: 0.31 },
    { time: '12:00', value: 0.37 },
    { time: '13:00', value: 0.29 },
    { time: '14:00', value: 0.44 },
    { time: '15:00', value: 0.41 },
    { time: '16:00', value: 0.52 },
    { time: '17:00', value: 0.58 },
    { time: '18:00', value: 0.49 },
    { time: '19:00', value: 0.61 },
    { time: '20:00', value: 0.67 },
    { time: '21:00', value: 0.72 },
    { time: '22:00', value: 0.84 },
    { time: '23:00', value: 0.91 }
  ], []);

  const data = useMemo(() => {
    return selectedOption === 'conversion' ? conversionData : engagementData;
  }, [selectedOption, conversionData, engagementData]);

  const title = useMemo(() => {
    return selectedOption === 'conversion' ? 'Конверсия' : 'Вовлеченность';
  }, [selectedOption]);

  const currentValue = useMemo(() => {
    return data[data.length - 1].value;
  }, [data]);

  const [displayValue, setDisplayValue] = useState<number>(currentValue);
  const [previousDisplayValue, setPreviousDisplayValue] = useState<number>(currentValue);

  const triggerHapticFeedback = useCallback(() => {
    try {
      const tgWindow = window as WindowWithTG;
      if (tgWindow?.Telegram?.WebApp?.HapticFeedback?.selectionChanged) {
        tgWindow.Telegram.WebApp.HapticFeedback.selectionChanged();
        return;
      }

      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
    } catch {
      console.debug('Haptic feedback not available');
    }
  }, []);

  useEffect(() => {
    if (hoverIndex !== null) {
      const newValue = data[hoverIndex].value;
      setPreviousDisplayValue(displayValue);
      setDisplayValue(newValue);
    } else {
      setPreviousDisplayValue(displayValue);
      setDisplayValue(currentValue);
      lastHapticIndexRef.current = null;
    }
  }, [hoverIndex, data, displayValue, currentValue]);

  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown, true); // capture
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, [isDropdownOpen]);

  const chartConfig = useMemo(() => {
    const values = data.map(d => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    const yMin = Math.floor(minVal * 10) / 10;
    const yMax = Math.ceil(maxVal * 10) / 10;

    const rawStep = (yMax - yMin) / 3;
    const step = Math.ceil(rawStep * 10) / 10;

    const yTicks = [
      yMin,
      Math.round((yMin + step) * 10) / 10,
      Math.round((yMin + step * 2) * 10) / 10,
      Math.round((yMin + step * 3) * 10) / 10
    ];

    const adjustedYMax = yMin + step * 3;
    const yAxisWidth = 35;

    if (minVal === 0 && maxVal === 0) {
      const yTicks = [0, 0.1, 0.2, 0.3];
      return {
        yMin: 0,
        adjustedYMax: 0.3,
        yTicks,
        yAxisWidth: yAxisWidth
      };
    }

    return { yMin, adjustedYMax, yTicks, yAxisWidth };
  }, [data]);

  const handleInteraction = useCallback((clientX: number) => {
    if (!chartContainerRef.current) return;

    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const chartWidth = rect.width - chartConfig.yAxisWidth;
    const adjustedX = x - chartConfig.yAxisWidth;

    if (adjustedX < 0 || adjustedX > chartWidth) {
      setHoverIndex(null);
      return;
    }

    const normalizedX = Math.max(0, Math.min(1, adjustedX / chartWidth));
    const rawIndex = normalizedX * (data.length - 1);
    const index = Math.round(rawIndex);

    if (lastHapticIndexRef.current !== null && lastHapticIndexRef.current !== index) {
      triggerHapticFeedback();
    }
    lastHapticIndexRef.current = index;

    setHoverIndex(index);
  }, [data.length, chartConfig.yAxisWidth, triggerHapticFeedback]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isTouching) {
      handleInteraction(e.clientX);
    }
  }, [handleInteraction, isTouching]);

  const handleMouseLeave = useCallback(() => {
    if (!isTouching) {
      setHoverIndex(null);
    }
  }, [isTouching]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsTouching(true);
    const touch = e.touches[0];
    if (touch) {
      handleInteraction(touch.clientX);
    }
  }, [handleInteraction]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      handleInteraction(touch.clientX);
    }
  }, [handleInteraction]);

  const handleTouchEnd = useCallback(() => {
    setIsTouching(false);
    setTimeout(() => {
      setHoverIndex(null);
    }, 150);
  }, []);

  const baseChart = useMemo(() => (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 22, right: 0, left: 0, bottom: -20 }}
      >
        <defs>
          <linearGradient id="areaGradientConversionBase" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0077B6" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#0077B6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          stroke="#0B2430"
          strokeDasharray="4,4"
          strokeWidth={1}
          opacity={0.3}
          horizontal={true}
          vertical={false}
        />
        <XAxis
          dataKey="time"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 0 }}
        />
        <YAxis
          domain={[chartConfig.yMin, chartConfig.adjustedYMax]}
          ticks={chartConfig.yTicks}
          axisLine={false}
          tickLine={false}
          tick={{
            fontSize: 14,
            fontFamily: 'Inter',
            fontWeight: 500,
            fill: '#0B2430',
            fillOpacity: 0.6,
            textAnchor: 'end'
          }}
          tickFormatter={(value) => value.toFixed(1)}
          interval={0}
          width={chartConfig.yAxisWidth}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#0077B6"
          strokeWidth={2.5}
          fill="url(#areaGradientConversionBase)"
          dot={false}
          activeDot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  ), [data, chartConfig]);

  const transparentChart = useMemo(() => (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 22, right: 0, left: 0, bottom: -20 }}
      >
        <defs>
          <linearGradient id="areaGradientConversionTransparent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0077B6" stopOpacity={0.08} />
            <stop offset="100%" stopColor="#0077B6" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          stroke="#0B2430"
          strokeDasharray="4,4"
          strokeWidth={1}
          opacity={0.1}
          horizontal={true}
          vertical={false}
        />
        <XAxis
          dataKey="time"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 0 }}
        />
        <YAxis
          domain={[chartConfig.yMin, chartConfig.adjustedYMax]}
          ticks={chartConfig.yTicks}
          axisLine={false}
          tickLine={false}
          tick={{
            fontSize: 14,
            fontFamily: 'Inter',
            fontWeight: 500,
            fill: '#0B2430',
            fillOpacity: 0.2,
            textAnchor: 'end'
          }}
          tickFormatter={(value) => value.toFixed(1)}
          interval={0}
          width={chartConfig.yAxisWidth}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#0077B6"
          strokeWidth={2.5}
          strokeOpacity={0.25}
          fill="url(#areaGradientConversionTransparent)"
          dot={false}
          activeDot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  ), [data, chartConfig]);

  const linePosition = useMemo(() => {
    if (hoverIndex === null || !chartContainerRef.current) return null;

    const rect = chartContainerRef.current.getBoundingClientRect();
    const totalWidth = rect.width;
    const xPositionPx = chartConfig.yAxisWidth + (hoverIndex / (data.length - 1)) * (totalWidth - chartConfig.yAxisWidth);
    const xPositionPercent = (xPositionPx / totalWidth) * 100;

    return { xPositionPx, xPositionPercent };
  }, [hoverIndex, data.length, chartConfig.yAxisWidth]);

  const verticalLine = useMemo(() => {
    if (!linePosition) return null;

    return (
      <div
        className="absolute pointer-events-none z-30"
        style={{
          left: `${linePosition.xPositionPx}px`,
          top: '21.5px',
          height: 'calc(100% - 31px)',
          width: '1.5px',
          background: 'repeating-linear-gradient(to bottom, #0B2430 0px, #0B2430 6px, transparent 6px, transparent 12px)',
          opacity: 0.4
        }}
      />
    );
  }, [linePosition]);

  const timeLabel = useMemo(() => {
    if (!linePosition || hoverIndex === null || !chartContainerRef.current) return null;

    const rect = chartContainerRef.current.getBoundingClientRect();
    const totalWidth = rect.width;

    const labelWidth = 40;
    const halfLabelWidth = labelWidth / 2;

    let transform = 'translateX(-50%)';
    let leftPosition = linePosition.xPositionPx;

    if (linePosition.xPositionPx - halfLabelWidth < 0) {
      transform = 'translateX(0)';
      leftPosition = 0;
    }
    else if (linePosition.xPositionPx + halfLabelWidth > totalWidth) {
      transform = 'translateX(-100%)';
      leftPosition = totalWidth;
    }

    return (
      <div
        className="absolute pointer-events-none z-30"
        style={{
          left: `${leftPosition}px`,
          top: '-5px',
          transform: transform
        }}
      >
        <span className="text-white text-sm font-inter font-medium opacity-60 whitespace-nowrap">
          {data[hoverIndex].time}
        </span>
      </div>
    );
  }, [linePosition, hoverIndex, data]);

  const displayValueString = displayValue.toFixed(2);
  const previousDisplayValueString = previousDisplayValue.toFixed(2);

  const animatedValue = useMemo(() => (
    <div className="flex items-center justify-start leading-none gap-[2px] mt-2">
      {displayValueString.split('').map((digit, index) => (
        <AnimatedDigit
          key={index}
          digit={digit}
          previousDigit={previousDisplayValueString[index] || '0'}
          index={index}
          color="text-white"
        />
      ))}
    </div>
  ), [displayValueString, previousDisplayValueString]);

  const handleDropdownToggle = useCallback(() => {
    setIsDropdownOpen(!isDropdownOpen);
  }, [isDropdownOpen]);

  const handleOptionSelect = useCallback((option: 'conversion' | 'engagement') => {
    setSelectedOption(option);
    setIsDropdownOpen(false);
  }, []);

  const headerContent = useMemo(() => (
    <div className="flex justify-between items-start mb-2">
      <div className="flex-1 min-w-0 mr-3">
        <div className="flex items-center gap-3">
          <h3 className="text-white/80 font-inter text-lg font-normal truncate">
            {title}
          </h3>
          {isLoading ? (
            <Skeleton className="w-16 h-6" variant="rectangular" />
          ) : (
            <div className="bg-second-accent ios-curve-xl px-4 py-1 flex-shrink-0">
              <span className="text-black font-inter text-sm font-medium">
                {isPositive ? '+' : '-'}{changePercent}
              </span>
            </div>
          )}
        </div>
        {isLoading ? (
          <div className="mt-2">
            <Skeleton className="w-24 h-[58px]" variant="rectangular" />
          </div>
        ) : (
          animatedValue
        )}
      </div>
      <div className="relative flex-shrink-0" ref={dropdownRef}>
        {isLoading ? (
          <Skeleton className="w-32 h-9" variant="rectangular" />
        ) : (
          <button
            onClick={handleDropdownToggle}
            className="bg-white/20 hover:bg-white/30 border-[0.25px] border-white/20 ios-curve-sm px-4 py-2 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-white font-inter text-sm font-normal">
                {selectedOption === 'conversion' ? 'Конверсия' : 'Вовлеченность'}
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 8"
                fill="none"
                className={`text-white transition-transform duration-200 mt-[1px] ${isDropdownOpen ? 'rotate-180' : ''}`}
              >
                <path
                  d="M1 1.5L6 6.5L11 1.5"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </button>
        )}
        {isDropdownOpen && !isLoading && (
          <div className="absolute right-0 top-full mt-1 bg-black/60 backdrop-blur-md ios-curve-md border border-white/20 p-1 min-w-[140px] z-50 shadow-xl">
            <button
              onClick={() => handleOptionSelect('conversion')}
              className={`w-full px-3 py-2 text-left font-inter text-sm transition-colors ios-curve-sm ${selectedOption === 'conversion'
                ? 'text-white bg-white/15'
                : 'text-white/70 font-light hover:bg-white/10 hover:text-white/90'
                }`}
            >
              Конверсия
            </button>
            <button
              onClick={() => handleOptionSelect('engagement')}
              className={`w-full px-3 py-2 text-left font-inter text-sm transition-colors ios-curve-sm mt-1 ${selectedOption === 'engagement'
                ? 'text-white bg-white/15'
                : 'text-white/70 font-light hover:bg-white/10 hover:text-white/90'
                }`}
            >
              Вовлеченность
            </button>
          </div>
        )}
      </div>
    </div>
  ), [title, changePercent, isPositive, animatedValue, selectedOption, isDropdownOpen, handleDropdownToggle, handleOptionSelect, isLoading]);

  if (isLoading) {
    return (
      <div className="glass glass-border-light rounded-[24px] p-6 w-full select-none">
        {headerContent}

        <div className="h-32 w-full relative overflow-hidden">
          <Skeleton className="w-full h-full" variant="rectangular" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass glass-border-light rounded-[24px] p-6 w-full select-none">
      {headerContent}

      <div
        ref={chartContainerRef}
        className="h-32 w-full relative overflow-hidden touch-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="absolute inset-0 z-10"
          style={{
            maskImage: linePosition
              ? `linear-gradient(to right, black 0%, black ${linePosition.xPositionPercent}%, transparent ${linePosition.xPositionPercent}%, transparent 100%)`
              : undefined,
            WebkitMaskImage: linePosition
              ? `linear-gradient(to right, black 0%, black ${linePosition.xPositionPercent}%, transparent ${linePosition.xPositionPercent}%, transparent 100%)`
              : undefined
          }}
        >
          {baseChart}
        </div>
        <div className="absolute inset-0 z-5">
          {transparentChart}
        </div>
        {verticalLine}
        {timeLabel}
      </div>
    </div>
  );
});

ExtendedChart.displayName = 'ExtendedChart';

export default ExtendedChart;