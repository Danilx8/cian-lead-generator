export type Platform = 'android' | 'android_x' | 'ios' | 'web' | 'desktop' | 'tdesktop' | 'macos' | 'windows' | 'linux';

export interface TelegramWebApp {
  initDataRaw?: string;
  initData?: string;
  close?: () => void;
  initDataUnsafe?: {
    user?: {
      id: number;
      username?: string;
    };
  };
  HapticFeedback?: {
    selectionChanged: () => void;
  };
}

export type TelegramWA = TelegramWebApp;
