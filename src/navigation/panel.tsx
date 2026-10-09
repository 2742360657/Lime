import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PanelItem } from './types';

export type PanelState = { title: string; items: PanelItem[] };

type PanelContextValue = {
  panels: Record<string, PanelState>;
  setPanel: (routeName: string, panel: PanelState) => void;
};

const PanelContext = createContext<PanelContextValue | null>(null);

export function PanelProvider({ children }: PropsWithChildren) {
  const [panels, setPanels] = useState<Record<string, PanelState>>({});
  const setPanel = useCallback((routeName: string, panel: PanelState) => {
    setPanels((current) => {
      const previous = current[routeName];
      const unchanged = previous && previous.title === panel.title && previous.items.length === panel.items.length &&
        previous.items.every((item, index) => {
          const next = panel.items[index];
          return next && item.id === next.id && item.label === next.label && item.selected === next.selected && item.bottom === next.bottom;
        });
      return unchanged ? current : { ...current, [routeName]: panel };
    });
  }, []);
  return <PanelContext.Provider value={{ panels, setPanel }}>{children}</PanelContext.Provider>;
}

export function usePanel(routeName: string) {
  const context = useContext(PanelContext);
  if (!context) throw new Error('usePanel must be used within PanelProvider');
  return context.panels[routeName] ?? { title: '页面操作', items: [] };
}

export function useRegisterPanel(routeName: string, title: string, items: PanelItem[]) {
  const context = useContext(PanelContext);
  if (!context) throw new Error('useRegisterPanel must be used within PanelProvider');
  const { setPanel } = context;
  const latest = useRef({ title, items });
  latest.current = { title, items };
  useEffect(() => {
    setPanel(routeName, latest.current);
  }, [setPanel, routeName, title, items]);
}
