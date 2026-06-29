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
      // Toutes les tailles standards de Tailwind sont augmentees de 5px par
      // rapport au defaut (caisse a vocation tactile, lisibilite iPad).
      fontSize: {
        xs:    ['17px',  { lineHeight: '21px' }],
        sm:    ['19px',  { lineHeight: '25px' }],
        base:  ['21px',  { lineHeight: '29px' }],
        lg:    ['23px',  { lineHeight: '33px' }],
        xl:    ['25px',  { lineHeight: '33px' }],
        '2xl': ['29px',  { lineHeight: '37px' }],
        '3xl': ['35px',  { lineHeight: '41px' }],
        '4xl': ['41px',  { lineHeight: '45px' }],
        '5xl': ['53px',  { lineHeight: '1' }],
        '6xl': ['65px',  { lineHeight: '1' }],
        '7xl': ['77px',  { lineHeight: '1' }],
        '8xl': ['101px', { lineHeight: '1' }],
        '9xl': ['133px', { lineHeight: '1' }],
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
