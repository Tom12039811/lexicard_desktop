/* ══════════════════════════════════════════════════════════════
   hooks.js — LexiCard: sdílené React hooky
══════════════════════════════════════════════════════════════ */

import { useState, useEffect } from "react";

/**
 * useState, který si hodnotu pamatuje v localStorage (per zařízení).
 * @param {string}   key       klíč v localStorage (prefix lc6_)
 * @param {*}        initial   výchozí hodnota (nebo funkce, která ji vrátí)
 * @param {function} validate  volitelně: vrátí false pro neplatnou uloženou hodnotu → použije se výchozí
 */
export function usePersistentState(key, initial, validate) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (!validate || validate(parsed)) return parsed;
      }
    } catch { /* poškozená nebo nedostupná hodnota → výchozí */ }
    return typeof initial === "function" ? initial() : initial;
  });

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* úložiště nedostupné */ }
  }, [key, value]);

  return [value, setValue];
}

/** true, pokud je šířka okna ≤ maxWidth (výchozí 640 px = mobil). Reaguje na otočení / změnu velikosti. */
export function useIsMobile(maxWidth = 640) {
  const query = `(max-width: ${maxWidth}px)`;
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && !!window.matchMedia?.(query).matches
  );

  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = e => setIsMobile(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [query]);

  return isMobile;
}
