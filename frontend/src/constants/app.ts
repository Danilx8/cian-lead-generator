import type { Platform } from '../types/telegram';

export const SAFE_AREA_DEFAULTS = {
  MOBILE: {
    TOP_PADDING: 16,
    BOTTOM_PADDING: 0,
  },
  DESKTOP: {
    TOP_PADDING: 16,
    BOTTOM_PADDING: 0,
  },
  NAVBAR: {
    HEIGHT: 78,
    PADDING: 12,
  },
} as const;

export const MOBILE_PLATFORMS: readonly Platform[] = ['ios', 'android', 'android_x'] as const;

export const DESKTOP_PLATFORMS: readonly Platform[] = [
  'tdesktop',
  'web',
  'desktop',
  'macos',
  'windows',
  'linux'
] as const;

export const NAV_ITEMS = [
  {
    id: 'home',
    icon: '/img/home-icon.svg',
    activeIcon: '/img/home-active-icon.svg',
    label: 'Home',
    path: '/'
  },
  {
    id: 'messenger',
    icon: '/img/messenger-icon.svg',
    activeIcon: '/img/messenger-active-icon.svg',
    label: 'Messenger',
    path: '/messages'
  },
  {
    id: 'profile',
    icon: '/img/profile-icon.svg',
    activeIcon: '/img/profile-active-icon.svg',
    label: 'Profile',
    path: '/profile'
  },
  {
    id: 'settings',
    icon: '/img/settings-icon.svg',
    activeIcon: '/img/settings-active-icon.svg',
    label: 'Settings',
    path: '/settings'
  }
] as const;

export const APP_IMAGES = [
  '/img/home-icon.svg',
  '/img/home-active-icon.svg',
  '/img/messenger-icon.svg',
  '/img/messenger-active-icon.svg',
  '/img/profile-icon.svg',
  '/img/profile-active-icon.svg',
  '/img/settings-icon.svg',
  '/img/settings-active-icon.svg',
  '/img/fast-start.svg',
  '/img/fast-slots.svg',
  '/img/fast-support.svg',
  '/img/fast-templates-icon.svg',
  '/img/elite-icon.svg',
] as const;

export const MOCK_DATA = {
  templates: [
    { id: '1', name: 'Приветствие' },
    { id: '2', name: 'Доставка' },
    { id: '3', name: 'Промо-акция' }
  ],
  qrService: 'Cian Pro',
  user: {
    id: 123456789,
    first_name: 'Test User',
    username: 'testuser',
    language_code: 'ru',
    is_premium: true,
  },
  themeParams: {
    bg_color: '#F5FAFD',
    text_color: '#0B2430',
    button_color: '#00AEEF',
    button_text_color: '#FFFFFF',
  }
} as const;

export type PlatformType = 'ios' | 'android' | 'android_x' | 'web' | 'desktop';
export type PlatformCategory = 'mobile' | 'desktop' | 'web';
