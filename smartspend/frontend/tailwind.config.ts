import { type Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // App surfaces
        cream: '#FDFBF8',        // app background
        shell: '#FAF3EF',        // sidebar tint
        frost: '#FFF8F4',        // topbar tint

        // Brand
        brand: {
          50:  '#FBE9E3',
          100: '#F7D4C9',
          200: '#F1B9A6',
          300: '#EA9B84',
          400: '#E77B5F',
          500: '#E25D37',        // primary
          600: '#C64F2F',
          700: '#A24327',
        },

        soft: '#EDE7E2',         // hairline borders
      },
      boxShadow: {
        card: '0 1px 0 rgba(16,24,40,.04), 0 8px 24px -8px rgba(16,24,40,.08)',
        navbar: '0 1px 0 rgba(16,24,40,.06)',
        lg: '0 8px 24px rgba(0, 0, 0, 0.05)',
      },
      borderRadius: {
        'xl2': '1.25rem',
      },
    },
  },
  plugins: [],
} satisfies Config
