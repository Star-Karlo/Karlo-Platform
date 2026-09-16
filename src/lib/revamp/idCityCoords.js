// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
// Approximate city-center coordinates for major Indonesian cities/regencies —
// public geographic reference points (not business data), used as a fallback
// to plot a truck on the map when its recorded location isn't one of the
// warehouses we already have coordinates for.
export const ID_CITY_COORDS = {
  'kota jakarta': { lat: -6.2088, lng: 106.8456 },
  'kota jakarta pusat': { lat: -6.1862, lng: 106.834 },
  'kota jakarta utara': { lat: -6.1214, lng: 106.774 },
  'kota jakarta selatan': { lat: -6.2615, lng: 106.8106 },
  'kota jakarta timur': { lat: -6.2251, lng: 106.9004 },
  'kota jakarta barat': { lat: -6.1683, lng: 106.7588 },
  'kota bekasi': { lat: -6.2383, lng: 106.9756 },
  'kota bandung': { lat: -6.9349, lng: 107.6395 },
  'kota semarang': { lat: -6.9667, lng: 110.4381 },
  'kota salatiga': { lat: -7.3305, lng: 110.5084 },
  'kota magelang': { lat: -7.4797, lng: 110.2177 },
  'kabupaten kendal': { lat: -6.9187, lng: 110.2043 },
  'kota solo': { lat: -7.5755, lng: 110.8243 },
  'kota surakarta': { lat: -7.5755, lng: 110.8243 },
  'kota yogyakarta': { lat: -7.7956, lng: 110.3695 },
  'kota cirebon': { lat: -6.7063, lng: 108.5571 },
  'kota surabaya': { lat: -7.2575, lng: 112.7521 },
  'kota malang': { lat: -7.9666, lng: 112.6326 },
  'kota denpasar': { lat: -8.6705, lng: 115.2126 },
  'kota bandar lampung': { lat: -5.3971, lng: 105.2668 },
  'kota medan': { lat: 3.5952, lng: 98.6722 },
  'kota pekanbaru': { lat: 0.5333, lng: 101.45 },
  'kota makassar': { lat: -5.1477, lng: 119.4327 },
  'kota parepare': { lat: -4.0135, lng: 119.6255 },
  'kota palembang': { lat: -2.9761, lng: 104.7754 },
  'kota jambi': { lat: -1.6101, lng: 103.6131 },
}

export function coordsForCity(kota) {
  const k = (kota || '').trim().toLowerCase()
  return ID_CITY_COORDS[k] || null
}
