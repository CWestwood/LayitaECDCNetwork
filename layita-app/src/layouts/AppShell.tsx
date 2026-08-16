import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

interface ShellContextValue {
  setSidebarFooter: (footer: ReactNode) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function useAppShellFooter(footer: ReactNode) {
  const shell = useContext(ShellContext);
  useEffect(() => {
    if (!shell) return;
    shell.setSidebarFooter(footer);
    return () => shell.setSidebarFooter(null);
  }, [footer, shell]);
}

export default function AppShell() {
  const [sidebarFooter, setSidebarFooter] = useState<ReactNode>(null);
  const contextValue = useMemo(() => ({ setSidebarFooter }), []);

  return (
    <ShellContext.Provider value={contextValue}>
      <div className="app-shell">
        <Sidebar footer={sidebarFooter} />
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </ShellContext.Provider>
  );
}
