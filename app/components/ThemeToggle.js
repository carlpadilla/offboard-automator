'use client';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      style={{
        margin: '0.7em 0',
        padding: '0.5em 1.2em',
        borderRadius: '2em',
        border: 'none',
        background: theme === 'dark' ? '#232323' : '#e3e3e3',
        color: theme === 'dark' ? '#fff' : '#232323',
        fontWeight: 600,
        fontSize: '1em',
        cursor: 'pointer',
        boxShadow: theme === 'dark'
          ? '0 2px 10px #0002'
          : '0 2px 10px #aaa2'
      }}
      aria-label="Toggle light/dark mode"
    >
      {theme === 'dark' ? '🌙 Dark Mode' : '🌞 Light Mode'}
    </button>
  );
}
