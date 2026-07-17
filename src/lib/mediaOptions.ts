// Shared select options for MediaPosition, used by both the challenge
// builder's DisplaySettingsEditor and the intro carousel editor so they
// offer the same positions with the same labels instead of drifting apart.
// Lives outside any component file so Fast Refresh doesn't complain about a
// non-component export.
export const MEDIA_POSITION_OPTIONS = [
  { value: 'above', label: 'Boven de beschrijving' },
  { value: 'below', label: 'Onder de beschrijving' },
  { value: 'left', label: 'Links van de beschrijving' },
  { value: 'right', label: 'Rechts van de beschrijving' },
  { value: 'background', label: 'Als achtergrond' },
]
