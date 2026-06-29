import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FFFFFF',
        surface: '#FFFFFF',
        ink: {
          DEFAULT: '#1F2A24',
          soft: '#6B6F73',
        },
        // sage gardé pour compat ascendante (anciennes refs), mappé sur l'accent CSS var
        sage: {
          DEFAULT: 'var(--primary)',
          soft: 'var(--primary-soft)',
          deep: 'var(--primary-deep)',
        },
        beige: '#FFFFFF',
        danger: '#B42318',
        warning: '#B7791F',
        success: '#2F6B3F',
        border: '#E7E7EA',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Inter', 'sans-serif'],
      },
      // Toutes les tailles standards de Tailwind sont augmentees de ~2px par
      // rapport au defaut (caisse a vocation tactile, lisibilite iPad).
      fontSize: {
        xs:    ['14px',  { lineHeight: '18px' }],
        sm:    ['16px',  { lineHeight: '22px' }],
        base:  ['18px',  { lineHeight: '26px' }],
        lg:    ['20px',  { lineHeight: '30px' }],
        xl:    ['22px',  { lineHeight: '30px' }],
        '2xl': ['26px',  { lineHeight: '34px' }],
        '3xl': ['32px',  { lineHeight: '38px' }],
        '4xl': ['38px',  { lineHeight: '42px' }],
        '5xl': ['50px',  { lineHeight: '1' }],
        '6xl': ['62px',  { lineHeight: '1' }],
        '7xl': ['74px',  { lineHeight: '1' }],
        '8xl': ['98px',  { lineHeight: '1' }],
        '9xl': ['130px', { lineHeight: '1' }],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 17, 20, 0.04), 0 4px 12px rgba(15, 17, 20, 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
