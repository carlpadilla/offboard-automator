'use client';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 ${
        theme === 'dark'
          ? 'bg-zinc-800 text-white hover:bg-zinc-700 focus:ring-zinc-500'
          : 'bg-zinc-200 text-zinc-800 hover:bg-zinc-300 focus:ring-zinc-300'
      }`}
      aria-label="Toggle light/dark mode"
      title="Toggle light/dark mode"
    >
      {theme === 'dark' ? '🌙 Dark Mode' : '🌞 Light Mode'}
    </button>
  );
}
