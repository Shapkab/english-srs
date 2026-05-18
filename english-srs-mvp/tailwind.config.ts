import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F6F1E8',
        'bg-elev': '#FBF7EF',
        'bg-card': '#FFFFFF',
        'bg-sunken': '#EFE8DB',

        ink: '#2A2520',
        'ink-soft': '#5A5048',
        'ink-faint': '#8C8074',
        'ink-ghost': '#B8AC9F',

        line: '#E5DCC9',
        'line-soft': '#EDE6D6',
        'line-strong': '#D6C9AF',

        sage: 'oklch(0.88 0.045 145)',
        'sage-deep': 'oklch(0.62 0.07 145)',
        peach: 'oklch(0.88 0.05 50)',
        'peach-deep': 'oklch(0.60 0.10 40)',
        lavender: 'oklch(0.86 0.055 290)',
        'lavender-deep': 'oklch(0.52 0.09 290)',
        butter: 'oklch(0.92 0.07 95)',
        'butter-deep': 'oklch(0.38 0.09 95)',
        rose: 'oklch(0.87 0.055 18)',
        'rose-deep': 'oklch(0.58 0.13 22)',
        tense: 'oklch(0.86 0.05 230)',
        'tense-deep': 'oklch(0.50 0.12 235)',
        order: 'oklch(0.88 0.05 170)',
        'order-deep': 'oklch(0.50 0.10 170)',
        style: 'oklch(0.88 0.04 320)',
        'style-deep': 'oklch(0.52 0.10 320)',
      },
      fontFamily: {
        serif: ['var(--font-serif)', '"Instrument Serif"', 'Iowan Old Style', 'serif'],
        sans: ['var(--font-sans)', 'Geist', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', '"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { DEFAULT: '10px', lg: '16px', xl: '24px' },
      boxShadow: {
        card: '0 1px 0 rgba(42,37,32,.04), 0 2px 8px rgba(42,37,32,.04)',
        lift: '0 1px 0 rgba(42,37,32,.05), 0 10px 30px -10px rgba(42,37,32,.12)',
      },
    },
  },
} satisfies Config;
