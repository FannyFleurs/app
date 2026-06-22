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
