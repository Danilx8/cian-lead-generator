import React, { memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store/appStore';
import { flushMessagesListScrollIfRegistered, flushSlotsListScrollIfRegistered } from '../utils/listScrollRegistry';
import HomeIcon from '@img/home-icon.svg?react';
import HomeActiveIcon from '@img/home-active-icon.svg?react';
import MessengerIcon from '@img/messenger-icon.svg?react';
import MessengerActiveIcon from '@img/messenger-active-icon.svg?react';
import ProfileIcon from '@img/profile-icon.svg?react';
import ProfileActiveIcon from '@img/profile-active-icon.svg?react';
import SettingsIcon from '@img/settings-icon.svg?react';
import SettingsActiveIcon from '@img/settings-active-icon.svg?react';

type SvgComponent = React.FC<React.SVGProps<SVGSVGElement>>;

interface NavItem {
  id: string;
  path: string;
  label: string;
  Icon: SvgComponent;
  ActiveIcon: SvgComponent;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', path: '/', label: 'Главная', Icon: HomeIcon, ActiveIcon: HomeActiveIcon },
  { id: 'messages', path: '/messages', label: 'Сообщения', Icon: MessengerIcon, ActiveIcon: MessengerActiveIcon },
  { id: 'profile', path: '/profile', label: 'Профиль', Icon: ProfileIcon, ActiveIcon: ProfileActiveIcon },
  { id: 'settings', path: '/settings', label: 'Настройки', Icon: SettingsIcon, ActiveIcon: SettingsActiveIcon },
];

// Fluid, jelly-like springs
const SPRING_INDICATOR = { type: 'spring' as const, stiffness: 200, damping: 22, mass: 1.2 };
const SPRING_PRESS = { type: 'spring' as const, stiffness: 350, damping: 20, mass: 0.9 };
const SPRING_ICON = { type: 'spring' as const, stiffness: 180, damping: 18, mass: 1.0 };

const NavbarItem: React.FC<{
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}> = memo(({ item, isActive, onClick }) => {
  const CurrentIcon = isActive ? item.ActiveIcon : item.Icon;

  return (
    <motion.button
      onClick={onClick}
      className="relative flex items-center justify-center w-16 h-12"
      aria-label={item.label}
      whileTap={{ scale: 0.88 }}
      transition={SPRING_PRESS}
    >
      {/* Indicator — full pill, extends beyond button, same light border as container */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            layoutId="navbar-indicator"
            className="absolute glass-border-light"
            style={{
              inset: '-8px -10px',
              borderRadius: '9999px',
              background: 'rgba(255, 255, 255, 0.6)',
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={SPRING_INDICATOR}
          />
        )}
      </AnimatePresence>

      {/* Icon */}
      <motion.div
        className="relative z-10 w-7 h-7"
        animate={{
          opacity: isActive ? 1 : 0.6,
          scale: isActive ? 1 : 0.95,
        }}
        transition={SPRING_ICON}
      >
        <CurrentIcon className="w-7 h-7" />
      </motion.div>
    </motion.button>
  );
});

const Navbar: React.FC = memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const safeAreaBottom = useAppStore(s => s.safeAreaBottom);

  const activeTab = NAV_ITEMS.find(item => item.path === location.pathname)?.id || 'home';

  const handleTabClick = (item: NavItem) => {
    if (location.pathname !== item.path) {
      const p = location.pathname;
      if (p === '/messages') flushMessagesListScrollIfRegistered();
      else if (p === '/slots') flushSlotsListScrollIfRegistered();
      navigate(item.path);
    }
  };

  const bottomMargin = Math.max(16, safeAreaBottom > 0 ? Math.min(safeAreaBottom, 34) + 8 : 16);

  return (
    <nav
      className="fixed z-50 left-0 right-0"
      style={{ bottom: `${bottomMargin}px` }}
    >
      {/* Bottom gradient scrim for readability on light backgrounds */}
      <div
        className="pointer-events-none fixed left-0 right-0 bottom-0 z-[-1]"
        style={{
          height: `${bottomMargin + 80}px`,
          background: 'linear-gradient(to top, rgba(245,250,253,0.9) 0%, rgba(245,250,253,0.4) 50%, transparent 100%)',
        }}
      />
      <div className="flex justify-center px-4">
        <div
          className="relative flex items-center gap-2 px-4 py-3 rounded-full glass-border-light"
          style={{
            backdropFilter: 'blur(8px) saturate(180%) brightness(1.05)',
            WebkitBackdropFilter: 'blur(8px) saturate(180%) brightness(1.05)',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.6) 100%)',
            boxShadow: '0 8px 32px rgba(11,36,48,0.12), 0 2px 6px rgba(11,36,48,0.08)',
          }}
        >
          {/* Nav items */}
          <div className="relative z-10 flex items-center gap-2">
            {NAV_ITEMS.map((item) => (
              <NavbarItem
                key={item.id}
                item={item}
                isActive={activeTab === item.id}
                onClick={() => handleTabClick(item)}
              />
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
});

NavbarItem.displayName = 'NavbarItem';
Navbar.displayName = 'Navbar';

export default Navbar;
