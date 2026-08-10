import type { Config } from 'tailwindcss';

const config: Config = {
  // `lib/` DOIT être scanné : des composants y vivent (ex. lib/ui/dialog.tsx,
  // la popup de confirmation au thème). Sans ça, les classes utilisées
  // UNIQUEMENT dans lib/ — comme `z-[300]` de la popup — sont purgées du CSS ;
  // la popup se retrouvait alors sans z-index (auto) et passait DERRIÈRE le
  // ticket mobile (z-40), visible seulement au-dessus du catalogue.
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutres de la marque HelloPos. Volontairement en dur et non en
        // `var(--…)` : les variantes d'opacité de Tailwind (`border-border/60`,
        // `text-ink-soft/60`…) ne savent pas décomposer une variable CSS et
        // rendraient ces couleurs transparentes. Les mêmes valeurs sont
        // définies en variables dans globals.css pour le CSS manuscrit.
        bg: '#F8F6F0',
        surface: '#FFFFFF',
        ink: {
          DEFAULT: '#14211D',
          soft: '#5A625E',
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
        border: '#E7E3D8',
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
