import React from 'react';
import { motion } from 'framer-motion';
import Skeleton from './Skeleton';
import { useNavigate } from 'react-router-dom';
import type { Template } from '../api/types';
import TemplatesIcon from '@img/fast-templates-icon.svg?react';
import SlotsIcon from '@img/fast-slots.svg?react';

const SPRING_TAP = { type: "spring" as const, stiffness: 500, damping: 25 };

interface QuickCardsProps {
  templates?: Template[];
  isLoading?: boolean;
  /** Живая сводка по слотам: сколько в работе из скольких (см. useSlotsSummary). */
  slots?: { active: number; running: number; total: number; loading: boolean };
}

interface CardProps {
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  onClick?: () => void;
  isLoading?: boolean;
}

const Card: React.FC<CardProps> = ({ title, icon, content, onClick, isLoading = false }) => {

  if (isLoading) {
    return (
      <div className="glass glass-border-light rounded-[20px] p-4 flex flex-col justify-between h-[150px]">
        <div className="flex items-start justify-between">
          <Skeleton className="w-20 h-6" variant="text" />
          <Skeleton className="w-6 h-6" variant="rectangular" />
        </div>
        <div className="flex-1 mt-2 space-y-2">
          <Skeleton className="w-full h-4" variant="text" />
          <Skeleton className="w-3/4 h-4" variant="text" />
        </div>
        <div className="flex items-center justify-between mt-auto">
          <Skeleton className="w-24 h-4" variant="text" />
          <Skeleton className="w-5 h-5" variant="rectangular" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      whileTap={{ scale: 0.95 }}
      transition={SPRING_TAP}
      className="glass glass-border-light rounded-[20px] p-4 flex flex-col justify-between h-[150px] cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <h3 className="text-white font-inter text-lg font-medium">
          {title}
        </h3>
        <div className="w-6 h-6 flex-shrink-0">{icon}</div>
      </div>

      <div className="text-white/60 font-inter text-sm font-normal flex-1 mt-2">
        {content}
      </div>

      <div className="flex items-center justify-between mt-auto">
        <span className="text-white/80 font-inter text-sm font-normal select-none">
          Редактировать
        </span>

        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          className="text-white/60 flex-shrink-0"
        >
          <path
            d="M7.5 5L12.5 10L7.5 15"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </motion.div>
  );
};

const QuickCards: React.FC<QuickCardsProps> = ({
  templates = [],
  isLoading = false,
  slots
}) => {
  const navigate = useNavigate();
  const truncateText = (text: string, maxLength: number = 14): string => {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '...';
  };

  const getTemplateContent = (): React.ReactNode => {
    if (templates.length === 0) {
      return 'нет добавленных';
    }

    if (templates.length === 1) {
      return truncateText(templates[0].title);
    }

    const getTemplateName = (template: Template): string => {
      return template.title;
    };

    const templateLines = templates.length === 2
      ? [
        truncateText(getTemplateName(templates[0])),
        truncateText(getTemplateName(templates[1]))
      ]
      : [
        truncateText(getTemplateName(templates[0])) + ',',
        truncateText(getTemplateName(templates[1])) + '...'
      ];

    return (
      <div className="space-y-1">
        {templateLines.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
    );
  };

  /** Подпись под заголовком карточки: состояние слотов словом, а не сухое «активны». */
  const getSlotsLabel = (s: NonNullable<QuickCardsProps['slots']>): string => {
    if (s.active === 0) return 'остановлены';
    // Живые есть, но ни один ещё не вышел в ACTIVE — очередь/подключение/подтверждение.
    if (s.running === 0) return 'запускаются';
    return 'запущены';
  };

  const getSlotsContent = (): React.ReactNode => {
    if (!slots || (slots.loading && slots.total === 0)) return 'управление';
    if (slots.total === 0) return 'нет слотов';

    const anyActive = slots.active > 0;

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {/* Индикатор в той же приглушённой палитре, «живость» несёт пульсация, а не цвет. */}
          <motion.span
            className="w-2 h-2 rounded-full flex-shrink-0 bg-white/40"
            animate={anyActive ? { opacity: [0.45, 1, 0.45] } : { opacity: 0.6 }}
            transition={anyActive ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : undefined}
          />
          <span>{getSlotsLabel(slots)}</span>
        </div>
        {/* key по счётчику — смена значения по сокету «подъезжает» пружиной */}
        <motion.div
          key={`${slots.active}/${slots.total}`}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8 }}
          className="tabular-nums"
        >
          {slots.active}/{slots.total}
        </motion.div>
      </div>
    );
  };

  const handleTemplatesClick = () => {
    navigate('/templates');
  };

  const handleSlotsClick = () => {
    navigate('/slots');
  };

  const handleAnalyticsClick = () => {
    navigate('/profile');
  };

  return (
    <div className="w-full mb-5">
      <div className="grid grid-cols-2 gap-4">
        <Card
          title="Шаблоны"
          icon={<TemplatesIcon className="w-6 h-6" />}
          content={getTemplateContent()}
          onClick={handleTemplatesClick}
          isLoading={isLoading}
        />

        <Card
          title="Слоты"
          icon={<SlotsIcon className="w-6 h-6" style={{ filter: 'brightness(0)' }} />}
          content={getSlotsContent()}
          onClick={handleSlotsClick}
          isLoading={isLoading}
        />

        <Card
          title="Аналитика"
          icon={(
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" aria-hidden="true">
              <path d="M4 20V10M10 20V4M16 20v-8M21 20H3" stroke="#0B2430" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          content="статистика лидов"
          onClick={handleAnalyticsClick}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};

export default QuickCards;
