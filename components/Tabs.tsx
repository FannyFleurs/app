'use client';

import { useState } from 'react';

interface Tab { key: string; label: string; content: React.ReactNode }

export default function Tabs({ tabs, initial }: { tabs: Tab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key ?? '');
  return (
    <div>
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === t.key
                ? 'border-sage text-sage-deep'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-5">
        {tabs.find((t) => t.key === active)?.content}
      </div>
    </div>
  );
}
