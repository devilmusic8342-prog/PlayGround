/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#040608',
          900: '#070a0e',
          850: '#0a0e14',
          800: '#0e131a',
          700: '#151c25',
        },
        mint: {
          200: '#c8ffe8',
          300: '#9df5cf',
          400: '#69e9b6',
          500: '#35d49a',
          600: '#1fb27e',
        },
        frost: '#a7b3c2',
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        panel: '0 30px 80px -30px rgba(0,0,0,.9), 0 1px 0 rgba(255,255,255,.06) inset',
        device: '0 55px 110px -35px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.09)',
      },
    },
  },
  plugins: [],
}
