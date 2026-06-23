import type { Config } from 'tailwindcss';

/**
 * TRANSITLAB design tokens — a precision engineering instrument, not a consumer
 * app. Dark UI chrome wrapping a bright map canvas.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Chrome / surfaces
        chrome: '#15181D', // near-black slate (toolbars, app background)
        surface: '#1E232B', // panel surface
        hairline: '#2C333D', // dividers / borders
        // Text
        ink: '#E8EBEF', // primary text
        muted: '#95A0AD', // secondary text
        // Accents
        signal: '#00B4A6', // primary action / selection (signal teal)
        caution: '#E8A13C', // analysis warnings, gaps (amber)
        danger: '#E5564E', // cost overruns, conflicts
      },
      fontFamily: {
        // UI / labels — tight and technical
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Data / coordinates / measurements
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '0.875rem', letterSpacing: '0.01em' }],
      },
      borderColor: {
        DEFAULT: '#2C333D',
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
      transitionDuration: {
        DEFAULT: '120ms',
      },
    },
  },
  plugins: [],
} satisfies Config;
