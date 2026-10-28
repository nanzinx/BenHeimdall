import type { Config } from 'tailwindcss';

/**
 * Sistema de design do BenHeimdall.
 *
 * As cores são trincas RGB em variáveis CSS (src/index.css), redefinidas no tema escuro, para
 * que os utilitários aceitem transparência: `bg-atend/10`, `border-crit/60`...
 * `status` é a cor do status do elemento (definida por `.s-ATENDENDO`, `.s-PAUSA`...).
 */
const cor = (nome: string) => `rgb(var(--${nome}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fundo: cor('fundo'),
        'fundo-2': cor('fundo-2'),
        superficie: cor('superficie'),
        'superficie-2': cor('superficie-2'),
        tinta: cor('tinta'),
        'tinta-2': cor('tinta-2'),
        linha: cor('linha'),
        marca: cor('marca'),
        'marca-2': cor('marca-2'),
        'marca-txt': cor('marca-txt'),
        destaque: cor('destaque'),
        'destaque-tinta': cor('destaque-tinta'),
        atend: cor('st-atend'),
        pos: cor('st-pos'),
        pausa: cor('st-pausa'),
        crit: cor('st-crit'),
        livre: cor('st-livre'),
        off: cor('st-off'),
        status: cor('c'),
      },
      fontFamily: {
        display: ['"Space Grotesk Variable"', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'],
        sans: ['"Inter Variable"', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      borderRadius: {
        cartao: '14px',
      },
      boxShadow: {
        cartao: 'var(--sombra)',
        'cartao-hover': 'var(--sombra-hover)',
        topo: '0 6px 24px rgba(7, 29, 77, 0.35)',
        marca: '0 6px 18px rgb(var(--marca) / 0.35)',
        destaque: '0 4px 12px rgb(var(--destaque) / 0.3)',
      },
      transitionTimingFunction: {
        suave: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        entrada: {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.985)' },
          to: { opacity: '1', transform: 'none' },
        },
        gaveta: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'none' },
        },
        // Anel que se expande na cor do status (--c) do elemento.
        pulso: {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--c) / 0.55)' },
          '100%': { boxShadow: '0 0 0 8px rgb(var(--c) / 0)' },
        },
        alerta: {
          '0%, 100%': { boxShadow: '0 0 0 0 transparent, inset 0 0 0 1px rgb(var(--st-crit))' },
          '50%': { boxShadow: '0 0 18px 0 rgb(var(--st-crit) / 0.25), inset 0 0 0 1px rgb(var(--st-crit))' },
        },
        salto: {
          '0%': { transform: 'translateY(4px)', opacity: '0.4' },
          '60%': { transform: 'translateY(-2px)' },
          '100%': { transform: 'none', opacity: '1' },
        },
        piscar: { from: { opacity: '1' }, to: { opacity: '0.35' } },
        flash: {
          from: { boxShadow: '0 0 0 2px rgb(var(--destaque)), 0 0 22px rgb(var(--destaque) / 0.35)' },
          to: { boxShadow: '0 0 0 2px transparent' },
        },
        brilho: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
      },
      animation: {
        entrada: 'entrada 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
        gaveta: 'gaveta 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
        pulso: 'pulso 1.6s ease-out infinite',
        'pulso-rapido': 'pulso 0.9s ease-out infinite',
        alerta: 'alerta 2s ease-in-out infinite',
        salto: 'salto 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
        piscar: 'piscar 0.8s ease-in-out infinite alternate',
        flash: 'flash 1.4s ease-out',
        brilho: 'brilho 8s linear infinite',
        'brilho-rapido': 'brilho 1.2s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
