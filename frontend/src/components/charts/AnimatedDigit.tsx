import React, { useState, useEffect, memo } from 'react';

interface AnimatedDigitProps {
    digit: string;
    previousDigit: string;
    index: number;
    color?: string;
    height?: number;
    fontSize?: string;
    fontWeight?: string;
    className?: string;
}

const AnimatedDigit: React.FC<AnimatedDigitProps> = memo(({
    digit,
    previousDigit,
    index,
    color = 'text-black',
    height = 58,
    fontSize = 'text-5xl',
    fontWeight = 'font-semibold',
    className = '',
}) => {
    const [isAnimating, setIsAnimating] = useState(false);
    const [direction, setDirection] = useState<'up' | 'down'>('up');

    useEffect(() => {
        if (digit !== previousDigit) {
            const currentNum = parseFloat(digit) || 0;
            const prevNum = parseFloat(previousDigit) || 0;
            setDirection(currentNum > prevNum ? 'up' : 'down');
            setIsAnimating(true);

            const timer = setTimeout(() => setIsAnimating(false), 300);
            return () => clearTimeout(timer);
        }
    }, [digit, previousDigit]);

    const getDigitWidth = (d: string) => {
        switch (d) {
            case '1': return 'w-[20px]';
            case '0': return 'w-[28px]';
            case '.': return 'w-[8px]';
            default: return 'w-[26px]';
        }
    };

    return (
        <div
            className={`relative inline-block overflow-hidden flex items-center justify-center ${getDigitWidth(digit)} ${className}`}
            style={{
                height: `${height}px`,
                transitionDelay: `${index * 50}ms`,
            }}
        >
            <div
                className={`relative w-full h-full transition-transform duration-300 ease-out ${isAnimating
                    ? direction === 'up'
                        ? `-translate-y-[${height}px]`
                        : `translate-y-[${height}px]`
                    : 'translate-y-0'
                    }`}
            >
                <div
                    className={`absolute w-full flex items-center justify-center leading-none ${fontSize} ${fontWeight} ${color}`}
                    style={{
                        height: `${height}px`,
                        top: direction === 'up' ? 0 : `-${height}px`,
                    }}
                >
                    {previousDigit}
                </div>
                <div
                    className={`absolute w-full flex items-center justify-center leading-none ${fontSize} ${fontWeight} ${color}`}
                    style={{
                        height: `${height}px`,
                        top: direction === 'up' ? `${height}px` : 0,
                    }}
                >
                    {digit}
                </div>
            </div>
        </div>
    );
});

AnimatedDigit.displayName = 'AnimatedDigit';

export default AnimatedDigit;
