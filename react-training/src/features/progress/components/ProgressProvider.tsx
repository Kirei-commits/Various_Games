// 進み具合を、アプリのどの部品からでも使えるように配る係。
import { createContext, useContext, type ReactNode } from 'react';
import { useProgressState, type ProgressActions } from '../hooks/useProgressState';
import type { Progress } from '../api/progressStorage';

type ProgressContextValue = { progress: Progress; actions: ProgressActions };

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const value = useProgressState();
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressContextValue {
  const value = useContext(ProgressContext);
  if (!value) throw new Error('useProgress は ProgressProvider の内側で使ってください');
  return value;
}
