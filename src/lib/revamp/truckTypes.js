// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
export const TRUCK_BODY_TYPES = ['Wingbox', 'Box', 'Bak', 'Dump', 'Flat Bed', 'Others', 'Box Reefer', 'Car Carrier', 'Motor Carrier', 'Bak Air Galon']
export const TRUCK_SIZES = ['Van/Pickup', 'CDE', 'CDD', 'Medium', 'Tronton', 'Trailer 20ft', 'Trailer 30ft', 'Trailer 40ft', 'Trailer 45ft']

export function truckTypeKey(body, size) {
  return `${body}|${size}`
}

export function truckTypeLabel(body, size) {
  if (size === 'Van/Pickup') return `Pickup ${body}`
  if (size.startsWith('Trailer')) return `Trailer ${body} ${size.replace('Trailer ', '')}`
  return `${size} ${body}`
}

const SIZE_GROUP_COLOR = {
  'Van/Pickup': '#495A72',
  CDE: '#E6A400',
  CDD: '#D98A00',
  Medium: '#3FAE55',
  Tronton: '#EA7A1E',
}

export function truckTypeColor(size) {
  return SIZE_GROUP_COLOR[size] || '#7B8794'
}

// Body type -> Icon name (see assets/icons.js's "truckBody*" set) — size
// isn't represented since it mostly changes scale, not the cargo shape.
const BODY_ICON = {
  Wingbox: 'truckBodyWingbox',
  Box: 'truckBodyBox',
  Bak: 'truckBodyBak',
  Dump: 'truckBodyDump',
  'Flat Bed': 'truckBodyFlatBed',
  Others: 'truckBodyOthers',
  'Box Reefer': 'truckBodyBoxReefer',
  'Car Carrier': 'truckBodyCarCarrier',
  'Motor Carrier': 'truckBodyMotorCarrier',
  'Bak Air Galon': 'truckBodyBakAirGalon',
}
export function truckBodyIconName(body) {
  return BODY_ICON[body] || 'truckBodyOthers'
}
