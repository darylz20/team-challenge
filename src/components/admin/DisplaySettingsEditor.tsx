import { Select } from '../ui/Select'
import { Toggle } from '../ui/Toggle'
import type { DisplayConfig, MediaPosition, MediaLayout, MediaSize } from '../../types'

interface DisplaySettingsEditorProps {
  display: DisplayConfig
  onChange: (display: DisplayConfig) => void
}

const COLUMN_OPTIONS = [
  { value: '1', label: '1 column' },
  { value: '2', label: '2 columns' },
  { value: '3', label: '3 columns' },
  { value: '4', label: '4 columns' },
]

const MEDIA_POSITION_OPTIONS = [
  { value: 'above', label: 'Above description' },
  { value: 'below', label: 'Below description' },
  { value: 'left', label: 'Left of description' },
  { value: 'right', label: 'Right of description' },
  { value: 'background', label: 'Background' },
]

const MEDIA_LAYOUT_OPTIONS = [
  { value: 'vertical', label: 'Stacked (vertical)' },
  { value: 'grid-2', label: '2-column grid' },
  { value: 'grid-3', label: '3-column grid' },
  { value: 'carousel', label: 'Carousel (swipe)' },
]

const MEDIA_SIZE_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large (default)' },
  { value: 'full', label: 'Full width' },
]

const DESCRIPTION_ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
]

export function DisplaySettingsEditor({ display, onChange }: DisplaySettingsEditorProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-faint">Controls how the challenge appears to players</p>
      <div className="grid grid-cols-2 gap-3">
        <Select
          id="columns"
          label="Answer Columns"
          options={COLUMN_OPTIONS}
          value={String(display.columns)}
          onChange={(e) =>
            onChange({ ...display, columns: parseInt(e.target.value) as 1 | 2 | 3 | 4 })
          }
        />
        <Select
          id="media-position"
          label="Media Position"
          options={MEDIA_POSITION_OPTIONS}
          value={display.media_position}
          onChange={(e) =>
            onChange({ ...display, media_position: e.target.value as MediaPosition })
          }
        />
        <Select
          id="media-layout"
          label="Media Layout"
          options={MEDIA_LAYOUT_OPTIONS}
          value={display.media_layout}
          onChange={(e) =>
            onChange({ ...display, media_layout: e.target.value as MediaLayout })
          }
        />
        <Select
          id="media-size"
          label="Media Size"
          options={MEDIA_SIZE_OPTIONS}
          value={display.media_size}
          onChange={(e) =>
            onChange({ ...display, media_size: e.target.value as MediaSize })
          }
        />
        <Select
          id="description-align"
          label="Description Alignment"
          options={DESCRIPTION_ALIGN_OPTIONS}
          value={display.description_align}
          onChange={(e) =>
            onChange({ ...display, description_align: e.target.value as 'left' | 'center' })
          }
        />
      </div>
      <Toggle
        label="Compact mode"
        description="Reduce spacing for content-heavy challenges"
        checked={display.compact}
        onChange={(checked) => onChange({ ...display, compact: checked })}
      />
    </div>
  )
}
