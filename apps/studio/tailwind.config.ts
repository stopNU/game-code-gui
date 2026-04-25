import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* ── Existing semantic tokens (hsl, opacity-modifier compatible) ── */
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        /* ── Design palette tokens (exact hex via CSS vars) ── */
        'surface-0': 'var(--surface-0)',
        'surface-1': 'var(--surface-1)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        'surface-4': 'var(--surface-4)',
        'surface-5': 'var(--surface-5)',
        'border-1': 'var(--border-1)',
        'border-2': 'var(--border-2)',
        'fg-0': 'var(--fg-0)',
        'fg-1': 'var(--fg-1)',
        'fg-2': 'var(--fg-2)',
        'fg-3': 'var(--fg-3)',
        'accent-lo': 'var(--accent-lo)',
        success: 'var(--success)',
        'success-lo': 'var(--success-lo)',
        warn: 'var(--warn)',
        danger: 'var(--danger)',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Segoe UI Variable"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'Consolas', '"Courier New"', 'monospace'],
      },
      fontSize: {
        '9': ['9px', { lineHeight: '1.2' }],
        '10': ['10px', { lineHeight: '1.4' }],
        '11': ['11px', { lineHeight: '1.5' }],
        '13': ['13px', { lineHeight: '1.5' }],
      },
      letterSpacing: {
        wider2: '0.12em',
        widest2: '0.28em',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(77, 158, 255, 0.15), 0 20px 80px rgba(77, 158, 255, 0.08)',
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
        'fade-up-1': 'fadeUp 0.35s 60ms cubic-bezier(0.16,1,0.3,1) both',
        'fade-up-2': 'fadeUp 0.35s 120ms cubic-bezier(0.16,1,0.3,1) both',
        blink: 'blink 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
