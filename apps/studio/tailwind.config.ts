import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(215 18% 18%)',
        input: 'hsl(215 18% 18%)',
        ring: 'hsl(192 83% 66%)',
        background: 'hsl(222 30% 7%)',
        foreground: 'hsl(210 24% 92%)',
        primary: {
          DEFAULT: 'hsl(192 83% 66%)',
          foreground: 'hsl(222 30% 10%)',
        },
        muted: {
          DEFAULT: 'hsl(220 18% 14%)',
          foreground: 'hsl(215 16% 68%)',
        },
        accent: {
          DEFAULT: 'hsl(156 64% 57%)',
          foreground: 'hsl(222 30% 10%)',
        },
        card: {
          DEFAULT: 'hsl(224 26% 10%)',
          foreground: 'hsl(210 24% 92%)',
        },
        destructive: {
          DEFAULT: 'hsl(0 72% 58%)',
          foreground: 'hsl(0 0% 98%)',
        },
      },
      fontFamily: {
        sans: ['"Segoe UI Variable"', 'Bahnschrift', '"Trebuchet MS"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'Consolas', '"Courier New"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(100, 218, 255, 0.2), 0 20px 80px rgba(18, 184, 255, 0.12)',
      },
      backgroundImage: {
        grid:
          'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};

export default config;
