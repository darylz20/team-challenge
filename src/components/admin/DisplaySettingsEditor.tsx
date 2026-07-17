import { Select } from '../ui/Select'
import { Toggle } from '../ui/Toggle'
import { MEDIA_POSITION_OPTIONS } from '../../lib/mediaOptions'
import type { DisplayConfig, MediaPosition, MediaLayout, MediaSize } from '../../types'

interface DisplaySettingsEditorProps {
  display: DisplayConfig
  onChange: (display: DisplayConfig) => void
}

const COLUMN_OPTIONS = [
  { value: '1', label: '1 kolom' },
  { value: '2', label: '2 kolommen' },
  { value: '3', label: '3 kolommen' },
  { value: '4', label: '4 kolommen' },
]

const MEDIA_LAYOUT_OPTIONS = [
  { value: 'vertical', label: 'Onder elkaar' },
  { value: 'grid-2', label: 'Raster van 2' },
  { value: 'grid-3', label: 'Raster van 3' },
  { value: 'carousel', label: 'Carrousel (swipen)' },
]

const MEDIA_SIZE_OPTIONS = [
  { value: 'small', label: 'Klein' },
  { value: 'medium', label: 'Middel' },
  { value: 'large', label: 'Groot (standaard)' },
  { value: 'full', label: 'Volledige breedte' },
]

const DESCRIPTION_ALIGN_OPTIONS = [
  { value: 'left', label: 'Links' },
  { value: 'center', label: 'Gecentreerd' },
]

export function DisplaySettingsEditor({ display, onChange }: DisplaySettingsEditorProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-faint">Bepaalt hoe de challenge er voor spelers uitziet</p>
      <div className="grid grid-cols-2 gap-3">
        <Select
          id="columns"
          label="Antwoordkolommen"
          options={COLUMN_OPTIONS}
          value={String(display.columns)}
          onChange={(e) =>
            onChange({ ...display, columns: parseInt(e.target.value) as 1 | 2 | 3 | 4 })
          }
        />
        <Select
          id="media-position"
          label="Mediapositie"
          options={MEDIA_POSITION_OPTIONS}
          value={display.media_position}
          onChange={(e) =>
            onChange({ ...display, media_position: e.target.value as MediaPosition })
          }
        />
        <Select
          id="media-layout"
          label="Media-indeling"
          options={MEDIA_LAYOUT_OPTIONS}
          value={display.media_layout}
          onChange={(e) =>
            onChange({ ...display, media_layout: e.target.value as MediaLayout })
          }
        />
        <Select
          id="media-size"
          label="Mediaformaat"
          options={MEDIA_SIZE_OPTIONS}
          value={display.media_size}
          onChange={(e) =>
            onChange({ ...display, media_size: e.target.value as MediaSize })
          }
        />
        <Select
          id="description-align"
          label="Uitlijning beschrijving"
          options={DESCRIPTION_ALIGN_OPTIONS}
          value={display.description_align}
          onChange={(e) =>
            onChange({ ...display, description_align: e.target.value as 'left' | 'center' })
          }
        />
      </div>
      <Toggle
        label="Compacte weergave"
        description="Minder witruimte voor challenges met veel inhoud"
        checked={display.compact}
        onChange={(checked) => onChange({ ...display, compact: checked })}
      />
    </div>
  )
}
