

const { ok, err, cors } = require('./db');

function _labelWilayah(raw, label, fullWord) {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.startsWith(fullWord.toLowerCase()) || lower.startsWith(label.toLowerCase().replace('.', ''))) {
    return raw;
  }
  return `${label} ${raw}`;
}

// Kabupaten Banggai Laut dimekarkan dari Kabupaten Banggai Kepulauan tahun
// 2013. Data TomTom utk beberapa kecamatan di sini masih belum ter-update:
// field countrySecondarySubdivision-nya kebaca "Banggai" polos (kabupaten
// induk lama), padahal kecamatan-kecamatan ini sekarang masuk Kab. Banggai
// Laut. Koreksi manual krn ini murni gap data provider, bukan salah mapping.
const _KEC_BANGGAI_LAUT = new Set([
  'banggai', 'banggai tengah', 'banggai selatan', 'banggai utara',
  'bokan kepulauan', 'bangkurung', 'labobo',
]);

function _formatAlamatTomTom(addr) {
  if (!addr) return null;
  const parts = [];

  
  
  
  const kecamatanRaw = addr.municipalitySubdivision || addr.municipality;
  if (kecamatanRaw) {
    parts.push(_labelWilayah(kecamatanRaw, 'Kecamatan', 'kecamatan'));
  }

  
  
  
  
  let kabKota = addr.countrySecondarySubdivision || addr.municipality;

  
  if (kabKota && /^banggai$/i.test(kabKota.trim()) && _KEC_BANGGAI_LAUT.has((kecamatanRaw || '').trim().toLowerCase())) {
    kabKota = 'Banggai Laut';
  }

  if (kabKota && kabKota !== kecamatanRaw) {
    parts.push(/kota/i.test(kabKota) ? kabKota : _labelWilayah(kabKota, 'Kabupaten', 'kabupaten'));
  }

  
  const provinsi = addr.countrySubdivisionName || addr.countrySubdivision;
  if (provinsi) {
    parts.push(_labelWilayah(provinsi, 'Provinsi', 'provinsi'));
  }

  return parts.length ? parts.join(', ') : null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  if (event.httpMethod !== 'POST') return err('Method tidak diizinkan', 405);

  const apiKey = process.env.TOMTOM_API_KEY || '';
  if (!apiKey) {
    console.error('[reverse-geocode] TOMTOM_API_KEY belum di-set');
    return ok({ lokasi: null });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
  const { lat, lon } = body;
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return err('lat/lon wajib diisi (number)', 400);
  }

  try {
    const url = `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lon}.json?key=${apiKey}&language=id-ID`;
    const r = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!r.ok) {
      console.error('[reverse-geocode] TomTom HTTP', r.status);
      return ok({ lokasi: null });
    }
    const d = await r.json();
    const addr = d?.addresses?.[0]?.address || null;
    const lokasi = _formatAlamatTomTom(addr) || addr?.freeformAddress || null;
    return ok({ lokasi });
  } catch (err) {
    console.error('[reverse-geocode]', err);
    return ok({ lokasi: null });
  }
};
