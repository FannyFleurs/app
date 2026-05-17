import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F7F5EF',
        surface: '#FFFFFF',
        ink: {
          DEFAULT: '#1F2A24',
          soft: '#6B746B',
        },
        sage: {
          DEFAULT: '#556B3E',
          soft: '#E8EFE2',
          deep: '#3F5430',
        },
        beige: '#EFE6D6',
        danger: '#B42318',
        warning: '#B7791F',
        success: '#2F6B3F',
        border: '#E5E2D8',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(31, 42, 36, 0.04), 0 4px 12px rgba(31, 42, 36, 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
