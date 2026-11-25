import React, { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { GlobalSearchModal } from '../common/GlobalSearchModal';
import { QuickNewModal } from '../common/QuickNewModal';
import { ToastContainer } from '../ui/ToastContainer';
import { BackLink } from './BackLink';
import { MadeBy } from '../common/MadeBy';

export const AppLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newModalOpen, setNewModalOpen] = useState(false);

  // Global keyboard shortcuts: ⌘K or Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }

      if (!isInput && e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey) {
        // Pressing 'n' when not in an input opens + NEW
        setNewModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-os-page font-sans antialiased text-os-ink">
      {/* The black rail: always beside the page on a computer, a drawer on a phone */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenNew={() => setNewModalOpen(true)}
      />

      {/* The page, to the right of the rail; content reads from the left edge */}
      <div className="lg:pl-[17rem] min-h-screen flex flex-col min-w-0">
        <TopBar
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenNew={() => setNewModalOpen(true)}
        />

        <main className="flex-1 w-full max-w-[88rem] px-4 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-9">
          <BackLink />
          <Outlet />
        </main>
        <MadeBy />
      </div>

      {/* Global Modals & Notifications */}
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <QuickNewModal isOpen={newModalOpen} onClose={() => setNewModalOpen(false)} />
      <ToastContainer />
    </div>
  );
};
