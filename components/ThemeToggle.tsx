"use client";

import { useEffect, useState } from "react";

/**
 * ThemeToggle
 *
 * Reads the current theme from <html class="dark"> (set by the inline script
 * in layout.tsx before first paint to avoid flash), and toggles it.
 * Preference is persisted to localStorage under "pear-theme".
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // Sync state with whatever the inline script already applied
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("pear-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("pear-theme", "light");
    }
  }

  return (
    <button
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="
        w-9 h-9 rounded-xl flex items-center justify-center
        bg-card border border-border-pear text-fg-muted
        hover:text-pear-green hover:border-pear-green/40
        transition-all duration-200 active:scale-90
      "
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
