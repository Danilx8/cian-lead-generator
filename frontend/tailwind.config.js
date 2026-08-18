/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Светлая сине-белая тема поверх исходной тёмной дизайн-системы:
      // имена токенов сохранены (black/white и т.д.), но значения перевёрнуты —
      // `bg-black` даёт светлый фон страницы, `text-white` — тёмный текст.
      colors: {
        accent: '#00AEEF',
        black: '#F5FAFD',
        white: '#0B2430',
        'second-accent': '#0077B6',
        'text-secondary': '#5E7C8B',
        'lighter-black': '#FFFFFF',
        'navbar-stroke': '#B9D7E5',
        'chart-text': '#0077B6',
      },
      backgroundImage: {
        'metalic-border': 'linear-gradient(125deg, #666 25.32%, rgba(102, 102, 102, 0.00) 103.26%)',
        'pro-gradient': 'linear-gradient(320deg, #A8A8A6 15.87%, #696969 48.67%, #F9F8F6 64.17%, #D4D4D4 75.79%, #7F7F7F 88.5%)',
        'premium-gradient': 'linear-gradient(138deg, #7A96AC 2.28%, #EAEFF3 19.8%, #C2D4E1 32.94%, #FFF 50.16%, #D4DEE5 62.15%, #ABBDC8 78.69%, #BCCAD7 95.24%)',
        'elite-gradient': 'linear-gradient(135deg, #8C421D 2.43%, #FBE67B 38.47%, #FCFBE7 53.36%, #F7D14E 69.97%, #D4A041 86.26%)',
        'icon-bg': 'linear-gradient(137deg, rgba(0, 174, 239, 0.10) 9.21%, rgba(0, 119, 182, 0.08) 90.87%)',
      },
      fontFamily: {
        'inter': ['Inter', 'sans-serif'],
      },
      borderRadius: {
        'ios-xs': '4px',
        'ios-sm': '8px',
        'ios-md': '12px',
        'ios-lg': '16px',
        'ios-xl': '20px',
        'ios-2xl': '24px',
        'ios-3xl': '32px',
        'ios-full': '50%',
        'superellipse-sm': '8px',
        'superellipse-md': '16px',
        'superellipse-lg': '24px',
        'superellipse-xl': '32px',
        'navbar-button': '25px',
        'subscription': '25px',
      },
      spacing: {
        'safe-bottom': 'min(env(safe-area-inset-bottom), 34px)',
      },
      height: {
        'navbar': 'calc(86px + min(env(safe-area-inset-bottom), 34px))',
        'navbar-dynamic': 'var(--navbar-height)',
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      const newUtilities = {
        '.superellipse-sm': {
          'clip-path': 'polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))',
          'border-radius': '8px',
        },
        '.superellipse-md': {
          'clip-path': 'polygon(0 12px, 12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px))',
          'border-radius': '12px',
        },
        '.superellipse-lg': {
          'clip-path': 'polygon(0 16px, 16px 0, calc(100% - 16px) 0, 100% 16px, 100% calc(100% - 16px), calc(100% - 16px) 100%, 16px 100%, 0 calc(100% - 16px))',
          'border-radius': '16px',
        },
        '.superellipse-xl': {
          'clip-path': 'polygon(0 24px, 24px 0, calc(100% - 24px) 0, 100% 24px, 100% calc(100% - 24px), calc(100% - 24px) 100%, 24px 100%, 0 calc(100% - 24px))',
          'border-radius': '24px',
        },
        '.ios-curve-sm': {
          'border-radius': '8px',
        },
        '.ios-curve-md': {
          'border-radius': '12px',
        },
        '.ios-curve-lg': {
          'border-radius': '16px',
        },
        '.ios-curve-xl': {
          'border-radius': '24px',
        },
        // Динамические утилиты для navbar
        '.pb-safe': {
          'padding-bottom': 'min(env(safe-area-inset-bottom), 34px)',
        },
        '.pb-safe-sm': {
          'padding-bottom': 'min(env(safe-area-inset-bottom), 20px)',
        },
        '.h-navbar': {
          'height': 'calc(86px + min(env(safe-area-inset-bottom), 34px))',
        },
        '.h-navbar-dynamic': {
          'height': 'var(--navbar-height)',
        },
        '.navbar-safe-padding': {
          'padding-bottom': 'var(--safe-area-inset-bottom-limited)',
        },
        '.content-safe-padding': {
          'padding-bottom': 'calc(var(--navbar-height) + 16px)',
        },
        // === Liquid Glass utilities ===
        // Light source: top-left diagonal
        // Top & left borders bright, bottom & right nearly invisible
        '.glass': {
          'position': 'relative',
          'background': 'rgba(255,255,255,0.55)',
          'backdrop-filter': 'blur(24px) saturate(1.3)',
          '-webkit-backdrop-filter': 'blur(24px) saturate(1.3)',
        },
        '.glass-elevated': {
          'position': 'relative',
          'background': 'rgba(255,255,255,0.72)',
          'backdrop-filter': 'blur(32px) saturate(1.4)',
          '-webkit-backdrop-filter': 'blur(32px) saturate(1.4)',
        },
        '.glass-indicator': {
          'position': 'relative',
          'background': 'rgba(255, 255, 255, 0.65)',
          'backdrop-filter': 'blur(16px) saturate(180%) brightness(1.02)',
          '-webkit-backdrop-filter': 'blur(16px) saturate(180%) brightness(1.02)',
          'border-radius': '22px',
        },
      }
      addUtilities(newUtilities)
    }
  ],
}