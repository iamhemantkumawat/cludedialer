/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cx: {
          bg:      '#F7F8FC',
          surface: '#FFFFFF',
          card:    '#FFFFFF',
          input:   '#F1F3F9',
          border:  'rgba(0,0,0,0.08)',
          text:    '#1A1B2E',
          muted:   '#64748B',
          brand:   '#E53935',
        },
        brand: {
          50:  '#fff0f0',
          100: '#ffd6d6',
          400: '#f87171',
          500: '#ef4444',
          600: '#E53935',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.07), 0 1px 2px -1px rgba(0,0,0,0.05)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.10)',
        'brand-sm': '0 2px 8px rgba(229,57,53,0.25)',
      },
    },
  },
  plugins: [],
};
