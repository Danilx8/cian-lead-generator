export const ROUTES = {
  HOME: '/',
  MESSAGES: '/messages',
  PROFILE: '/profile',
  SETTINGS: '/settings',
} as const;

export const NAV_ITEMS = [
  {
    id: 'home',
    icon: '/img/home-icon.svg',
    activeIcon: '/img/home-active-icon.svg',
    label: 'Home',
    path: ROUTES.HOME,
  },
  {
    id: 'messenger',
    icon: '/img/messenger-icon.svg',
    activeIcon: '/img/messenger-active-icon.svg',
    label: 'Messenger',
    path: ROUTES.MESSAGES,
  },
  {
    id: 'profile',
    icon: '/img/profile-icon.svg',
    activeIcon: '/img/profile-active-icon.svg',
    label: 'Profile',
    path: ROUTES.PROFILE,
  },
  {
    id: 'settings',
    icon: '/img/settings-icon.svg',
    activeIcon: '/img/settings-active-icon.svg',
    label: 'Settings',
    path: ROUTES.SETTINGS,
  },
] as const;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteKey];
export type NavItemId = (typeof NAV_ITEMS)[number]['id'];
