/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '150% 0' },
          '100%': { backgroundPosition: '-150% 0' },
        },
        'progress-sweep': {
          '0%':   { transform: 'translateX(-100%) scaleX(0.4)' },
          '50%':  { transform: 'translateX(40%) scaleX(0.6)' },
          '100%': { transform: 'translateX(150%) scaleX(0.4)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.8s ease-in-out infinite',
        'progress-sweep': 'progress-sweep 1.15s ease-in-out infinite',
      },
    }
  },
  plugins: []
};
