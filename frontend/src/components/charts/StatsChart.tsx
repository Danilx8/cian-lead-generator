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
import { TelegramWebApp } from "../../types/telegram";

interface StatsChartProps {
  changePercent: string;
  isPositive?: boolean;
  isLoading?: boolean;
}

const StatsChart: React.FC<StatsChartProps> = memo(({
  changePercent,
  isPositive = true,
  isLoading = false
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [selectedOption, setSelectedOption] = useState<'links' | 'messages'>('links');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isTouching, setIsTouching] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const lastHapticIndexRef = useRef<number | null>(null);

  const linksData = useMemo(() => [
    { time: '00:00', value: 12 },
    { time: '01:00', value: 8 },
    { time: '02:00', value: 15 },
    { time: '03:00', value: 23 },
    { time: '04:00', value: 31 },
    { time: '05:00', value: 18 },
    { time: '06:00', value: 42 },
    { time: '07:00', value: 35 },
    { time: '08:00', value: 29 },
    { time: '09:00', value: 47 },
    { time: '10:00', value: 38 },
    { time: '11:00', value: 52 },
    { time: '12:00', value: 61 },
    { time: '13:00', value: 45 },
    { time: '14:00', value: 73 },
    { time: '15:00', value: 68 },
    { time: '16:00', value: 84 },
    { time: '17:00', value: 92 },
    { time: '18:00', value: 76 },
    { time: '19:00', value: 89 },
    { time: '20:00', value: 95 },
    { time: '21:00', value: 103 },
    { time: '22:00', value: 118 },
    { time: '23:00', value: 127 }
  ], []);

  const messagesData = useMemo(() => [
    { time: '00:00', value: 5 },
    { time: '01:00', value: 3 },
    { time: '02:00', value: 7 },
    { time: '03:00', value: 12 },
    { time: '04:00', value: 18 },
    { time: '05:00', value: 9 },
    { time: '06:00', value: 25 },
    { time: '07:00', value: 21 },
    { time: '08:00', value: 16 },
    { time: '09:00', value: 28 },
    { time: '10:00', value: 22 },
    { time: '11:00', value: 31 },
    { time: '12:00', value: 37 },
    { time: '13:00', value: 29 },
    { time: '14:00', value: 44 },
    { time: '15:00', value: 41 },
    { time: '16:00', value: 52 },
    { time: '17:00', value: 58 },
    { time: '18:00', value: 49 },
    { time: '19:00', value: 61 },
    { time: '20:00', value: 67 },
    { time: '21:00', value: 72 },
    { time: '22:00', value: 84 },
    { time: '23:00', value: 91 }
  ], []);

  const data = useMemo(() => {
    return selectedOption === 'links' ? linksData : messagesData;
  }, [selectedOption, linksData, messagesData]);

  const title = useMemo(() => {
    return selectedOption === 'links' ? 'Создано ссылок' : 'Отправлено сообщений';
  }, [selectedOption]);

  const shortTitle = useMemo(() => {
    return selectedOption === 'links' ? 'Ссылки' : 'Сообщения';
  }, [selectedOption]);

  const currentValue = useMemo(() => {
    return data[data.length - 1].value;
  }, [data]);

  const [displayValue, setDisplayValue] = useState<number>(currentValue);
  const [previousDisplayValue, setPreviousDisplayValue] = useState<number>(currentValue);

  const triggerHapticFeedback = useCallback(() => {
    try {
      if ((window?.Telegram?.WebApp as TelegramWebApp)?.HapticFeedback?.selectionChanged) {
        (window?.Telegram?.WebApp as TelegramWebApp)?.HapticFeedback?.selectionChanged();
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

    document.addEventListener('mousedown', handleMouseDown, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, [isDropdownOpen]);

  const chartConfig = useMemo(() => {
    const values = data.map(d => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    const yMin = Math.floor(minVal / 20) * 20;
    const yMax = Math.ceil(maxVal / 20) * 20;

    const rawStep = (yMax - yMin) / 3;
    const step = Math.ceil(rawStep / 10) * 10;

    const yTicks = [
      yMin,
      yMin + step,
      yMin + step * 2,
      yMin + step * 3
    ];

    const adjustedYMax = yMin + step * 3;
    const maxTickValue = Math.max(...yTicks);
    const digits = maxTickValue.toString().length;
    const yAxisWidth = Math.max(25, digits * 8 + 10);

    if (minVal === 0 && maxVal === 0) {
      const yTicks = [0, 10, 20, 30];
      return {
        yMin: 0,
        adjustedYMax: 30,
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
          <linearGradient id="areaGradientBase" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00AEEF" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#00AEEF" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          stroke="#0B2430"
          strokeDasharray="4,4"
          strokeWidth={1}
          opacity={0.12}
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
            fillOpacity: 0.4,
            textAnchor: 'end'
          }}
          tickFormatter={(value) => Math.round(value).toString()}
          interval={0}
          width={chartConfig.yAxisWidth}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#00AEEF"
          strokeWidth={2.5}
          fill="url(#areaGradientBase)"
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
          <linearGradient id="areaGradientTransparent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00AEEF" stopOpacity={0.08} />
            <stop offset="100%" stopColor="#00AEEF" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          stroke="#0B2430"
          strokeDasharray="4,4"
          strokeWidth={1}
          opacity={0.06}
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
            fillOpacity: 0.15,
            textAnchor: 'end'
          }}
          tickFormatter={(value) => Math.round(value).toString()}
          interval={0}
          width={chartConfig.yAxisWidth}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#00AEEF"
          strokeWidth={2.5}
          strokeOpacity={0.25}
          fill="url(#areaGradientTransparent)"
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

  const displayValueString = displayValue.toString();
  const previousDisplayValueString = previousDisplayValue.toString();

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

  const handleOptionSelect = useCallback((option: 'links' | 'messages') => {
    setSelectedOption(option);
    setIsDropdownOpen(false);
  }, []);

  const headerContent = useMemo(() => (
    <div className="flex justify-between items-start mb-2">
      <div className="flex-1 min-w-0 mr-3">
        <div className="flex items-center gap-3">
          <h3 className="text-white/70 font-inter text-lg font-normal truncate">
            <span className="hidden sm:inline">{title}</span>
            <span className="sm:hidden">{shortTitle}</span>
          </h3>
          {isLoading ? (
            <Skeleton className="w-16 h-6" variant="rectangular" />
          ) : (
            <div className="ios-curve-xl px-4 py-1 flex-shrink-0" style={{ background: 'rgba(0, 174, 239, 0.15)', border: '0.5px solid rgba(0, 174, 239, 0.25)' }}>
              <span className="text-accent font-inter text-sm font-medium">
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
          <Skeleton className="w-24 h-9" variant="rectangular" />
        ) : (
          <button
            onClick={handleDropdownToggle}
            className="bg-white/10 hover:bg-white/20 border-[0.5px] border-white/15 ios-curve-sm px-4 py-2 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-white/80 font-inter text-sm font-normal">
                {selectedOption === 'links' ? 'Ссылки' : 'Сообщения'}
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 8"
                fill="none"
                className={`text-white/80 transition-transform duration-200 mt-[1px] ${isDropdownOpen ? 'rotate-180' : ''}`}
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
          <div className="absolute right-0 top-full mt-1 bg-black/60 backdrop-blur-md ios-curve-md border border-white/20 p-1 min-w-[120px] z-50 shadow-xl">
            <button
              onClick={() => handleOptionSelect('links')}
              className={`w-full px-3 py-2 text-left font-inter text-sm transition-colors ios-curve-sm ${selectedOption === 'links'
                ? 'text-white bg-white/15'
                : 'text-white/70 font-light hover:bg-white/10 hover:text-white/90'
                }`}
            >
              Ссылки
            </button>
            <button
              onClick={() => handleOptionSelect('messages')}
              className={`w-full px-3 py-2 text-left font-inter text-sm transition-colors ios-curve-sm mt-1 ${selectedOption === 'messages'
                ? 'text-white bg-white/15'
                : 'text-white/70 font-light hover:bg-white/10 hover:text-white/90'
                }`}
            >
              Сообщения
            </button>
          </div>
        )}
      </div>
    </div>
  ), [title, shortTitle, changePercent, isPositive, animatedValue, selectedOption, isDropdownOpen, handleDropdownToggle, handleOptionSelect, isLoading]);

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

StatsChart.displayName = 'StatsChart';

export default StatsChart;