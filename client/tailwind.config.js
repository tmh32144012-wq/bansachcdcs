/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      colors: {
        tet: {
          red: '#b91c1c',
          crimson: '#881313',
          dark: '#5c0b0b',
          gold: '#d97706',
          amber: '#f59e0b',
          lightGold: '#fde68a',
          cream: '#fffaf0',
          parchment: '#fef3c7',
          jade: '#0f766e',
        },
      },
    },
  },
  plugins: [],
};
