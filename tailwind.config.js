/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        safe: {
          light: '#d1fae5',
          DEFAULT: '#10b981',
          dark: '#047857',
        },
        info: {
          light: '#e0f2fe',
          DEFAULT: '#0ea5e9',
          dark: '#0369a1',
        },
        check: {
          light: '#fef3c7',
          DEFAULT: '#f59e0b',
          dark: '#b45309',
        },
        warning: {
          light: '#fee2e2',
          DEFAULT: '#ef4444',
          dark: '#b91c1c',
        },
        daw: {
          bg: '#18191c',
          panel: '#202226',
          panelBorder: '#2e3238',
          track: '#272a30',
          trackActive: '#32363e',
          pianoWhite: '#e2e8f0',
          pianoBlack: '#1e293b',
          gridLine: '#2a2d34',
          gridBeat: '#3c404b',
          gridBar: '#555b6a',
        }
      }
    },
  },
  plugins: [],
}
