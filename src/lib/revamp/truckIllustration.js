// @ts-nocheck
const FRONT = '<svg viewBox="0 0 120 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="30" y="20" width="60" height="45" rx="6"></rect><rect x="40" y="28" width="40" height="20" rx="3"></rect><circle cx="45" cy="80" r="10"></circle><circle cx="75" cy="80" r="10"></circle><line x1="30" y1="65" x2="90" y2="65"></line></svg>'
const BACK = '<svg viewBox="0 0 120 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="20" y="15" width="80" height="55" rx="4"></rect><line x1="60" y1="15" x2="60" y2="70"></line><rect x="30" y="25" width="20" height="30" rx="2"></rect><rect x="70" y="25" width="20" height="30" rx="2"></rect><circle cx="40" cy="82" r="9"></circle><circle cx="80" cy="82" r="9"></circle></svg>'
const SIDE = '<svg viewBox="0 0 160 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M10 65 L10 40 L35 40 L45 25 L65 25 L65 65 Z"></path><rect x="65" y="20" width="80" height="45"></rect><circle cx="30" cy="80" r="10"></circle><circle cx="115" cy="80" r="10"></circle><circle cx="135" cy="80" r="10"></circle></svg>'

export function truckIllustrationSVG(view) {
  if (view === 'front') return FRONT
  if (view === 'back') return BACK
  if (view === 'left') return `<div style="transform:scaleX(-1); display:flex;">${SIDE}</div>`
  return SIDE // right (default)
}
