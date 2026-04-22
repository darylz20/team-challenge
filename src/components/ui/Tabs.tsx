import { useState, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface Tab {
  label: string
  content: ReactNode
}

interface TabsProps {
  tabs: Tab[]
  defaultTab?: number
}

export function Tabs({ tabs, defaultTab = 0 }: TabsProps) {
  const [active, setActive] = useState(defaultTab)

  return (
    <div>
      <div className="flex gap-1 border-b border-surface-overlay overflow-x-auto">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setActive(i)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
              active === i
                ? 'text-neon border-neon'
                : 'text-text-muted border-transparent hover:text-text hover:border-surface-overlay',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="pt-4">{tabs[active]?.content}</div>
    </div>
  )
}
