import type { Config } from 'tailwindcss';

// Design tokens from the approved PickleMasters Live prototype.
// Components keep the prototype's exact hex utilities (e.g. bg-[#0B0F17]) so the
// UI renders pixel-identical; these tokens are here for new screens.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: { DEFAULT: '#0B0F17', 900: '#111827', 800: '#1F2937', 700: '#374151' },
        volt: { DEFAULT: '#A3E635', deep: '#84CC16' },
        cyber: '#06B6D4',
        gold: '#F59E0B',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Barlow Condensed', 'Arial Narrow', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'Barlow', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
