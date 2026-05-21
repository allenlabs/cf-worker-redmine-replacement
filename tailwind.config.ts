import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        redmine: {
          50: '#f1f7fb',
          100: '#dbeaf3',
          200: '#bcd6e8',
          300: '#8ebcd6',
          400: '#5b9bbd',
          500: '#3a7fa5',
          600: '#2f6688',
          700: '#28526e',
          800: '#234555',
          900: '#1f3a47',
        },
        status: {
          new: '#dde9f5',
          progress: '#fff3cd',
          resolved: '#d4edda',
          feedback: '#fcecd5',
          closed: '#e9ecef',
          rejected: '#f5d6d6',
        },
        priority: {
          low: '#c6e2f5',
          normal: '#e3e9ee',
          high: '#fde2cf',
          urgent: '#f6c4c4',
          immediate: '#e7adad',
        },
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
