import { useState, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface Tab {
  label: string
  content: ReactNode
}

interface TabsProps {
  tabs: Tab[]
  defaultTab?: number
  // Controlled mode: lets a parent persist the active tab (e.g. in the URL)
  // so it survives navigating away and back, instead of resetting on remount.
  active?: number
  onChange?: (index: number) => void
}

export function Tabs({ tabs, defaultTab = 0, active: activeProp, onChange }: TabsProps) {
  const [activeState, setActiveState] = useState(defaultTab)
  const active = activeProp ?? activeState

  function select(i: number) {
    onChange ? onChange(i) : setActiveState(i)
  }

  return (
    <div>
      <div className="flex gap-1 border-b border-surface-overlay overflow-x-auto">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => select(i)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
              active === i
                ? 'text-neon-ink border-neon'
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
