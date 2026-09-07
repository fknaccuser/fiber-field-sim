import { createContext, useContext } from 'react';
import type { ToolPresentation } from './navigation';

export const DockNavigation = createContext<{
  presentation: ToolPresentation;
  present(value: ToolPresentation): void;
  back(): void;
}>({ presentation: 'raised', present: () => undefined, back: () => undefined });

export const useDockNavigation = () => useContext(DockNavigation);
