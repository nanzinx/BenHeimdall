import type { Config } from 'tailwindcss';

// As cores vêm das variáveis CSS de src/index.css (tema claro e escuro).
const v = (nome: string) => `var(--${nome})`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fundo: v('bg'),
        superficie: v('surface'),
        'superficie-2': v('surface-2'),
        tinta: v('ink'),
        'tinta-2': v('ink-2'),
        linha: v('line'),
        marca: v('brand'),
        destaque: v('accent'),
      },
      fontFamily: {
        display: v('f-display'),
        sans: v('f-body'),
        mono: v('f-mono'),
      },
    },
  },
  plugins: [],
} satisfies Config;
