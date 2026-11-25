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
    <div role="tablist" className={clsx('border-b border-os-line flex items-center overflow-x-auto gap-1', className)}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={clsx(
              'px-4 h-12 text-base transition-colors whitespace-nowrap flex items-center gap-2 border-b-[3px] -mb-[1px]',
              isActive
                ? 'border-os-accent text-os-ink font-bold'
                : 'border-transparent text-os-muted hover:text-os-ink'
            )}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={clsx(
                  'min-w-[1.75rem] px-1.5 py-0.5 text-sm text-center',
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
