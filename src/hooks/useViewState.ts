import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

function readViewState<T>(key: string | undefined, fallback: T): T {
  if (!key) return fallback;
  try {
    const saved = window.sessionStorage.getItem(key);
    return saved === null ? fallback : JSON.parse(saved) as T;
  } catch {
    return fallback;
  }
}

export function useViewState<T>(key: string | undefined, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const fallbackRef = useRef(fallback);
  useEffect(() => { fallbackRef.current = fallback; }, [fallback]);
  const [snapshot, setSnapshot] = useState(() => ({ key, value: readViewState(key, fallback) }));
  const value = snapshot.key === key ? snapshot.value : readViewState(key, fallback);
  useEffect(() => {
    if (snapshot.key !== key || !key) return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(snapshot.value));
    } catch {
      // Keep navigation usable when browser storage is unavailable.
    }
  }, [key, snapshot]);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setSnapshot((current) => {
      const previous = current.key === key ? current.value : readViewState(key, fallbackRef.current);
      return { key, value: typeof next === "function" ? (next as (previous: T) => T)(previous) : next };
    });
  }, [key]);
  return [value, setValue];
}
