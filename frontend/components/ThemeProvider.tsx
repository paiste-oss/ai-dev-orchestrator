"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { type ThemeId, getSavedTheme, saveTheme } from "@/lib/theme";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "nacht",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("nacht");

  // Gespeichertes Theme beim Start anwenden
  useEffect(() => {
    const saved = getSavedTheme();
    setThemeState(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const setTheme = (id: ThemeId) => {
    setThemeState(id);
    saveTheme(id);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
