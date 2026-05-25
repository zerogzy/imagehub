/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ImageHub Design System - Light & Modern
        background: {
          DEFAULT: '#F5F9FF',
          secondary: '#F1F7FF',
          card: '#FFFFFF',
        },
        primary: {
          DEFAULT: '#38AFFF',
          hover: '#4BA3F2',
          light: '#EAF6FF',
          dark: '#1E7ACC',
        },
        text: {
          primary: '#1F2937',
          secondary: '#64748B',
          muted: '#94A3B8',
        },
        border: {
          DEFAULT: '#DCEBFA',
          light: '#EDF4FC',
        },
        danger: {
          DEFAULT: '#EF4444',
          light: '#FEF2F2',
          dark: '#DC2626',
        },
        success: {
          DEFAULT: '#22C55E',
          light: '#F0FDF4',
          dark: '#16A34A',
        },
        warning: {
          DEFAULT: '#F59E0B',
          light: '#FFFBEB',
          dark: '#D97706',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        'lg': '0.75rem',
        'xl': '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 4px 12px 0 rgba(56, 175, 255, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
        'modal': '0 20px 60px -15px rgba(0, 0, 0, 0.15)',
        'dropdown': '0 4px 16px 0 rgba(0, 0, 0, 0.08)',
        'sidebar': '2px 0 8px 0 rgba(0, 0, 0, 0.04)',
      },
      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-in': 'slide-in 300ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
        'slide-down': 'slide-down 200ms ease-out',
        'scale-in': 'scale-in 150ms ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
