import React from 'react';
import { clsx } from 'clsx';

interface TabItem {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange, className }) => {
  return (
    // A row of pills on a grey track; the open one is filled black.
    <div role="tablist" className={clsx('flex items-center overflow-x-auto gap-1 p-1 rounded-full bg-os-paper w-fit max-w-full', className)}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={clsx(
              'px-4 h-10 rounded-full text-[0.9375rem] font-semibold transition-colors whitespace-nowrap flex items-center gap-2',
              isActive ? 'bg-os-ink text-white' : 'text-os-muted hover:text-os-ink hover:bg-os-panel'
            )}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={clsx(
                  'min-w-[1.75rem] px-1.5 py-0.5 rounded-full text-xs text-center',
                  isActive ? 'bg-os-accent text-white' : 'bg-os-soft text-os-muted'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
