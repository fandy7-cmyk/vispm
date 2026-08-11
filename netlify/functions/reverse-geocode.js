// netlify/functions/reverse-geocode.js
// POST /api/reverse-geocode { lat, lon } → { lokasi } | { lokasi: null }
//
// Reverse-geocode koordinat GPS ke alamat administratif (Kec/Kab/Prov) pakai
// TomTom Reverse Geocoding API. Dipanggil dari frontend saat login, sebagai
// alternatif Nominatim/OSM yang datanya sering bolong buat kecamatan di
// daerah terpencil (mis. Banggai Laut). TomTom pakai data proprietary
// sendiri, bukan OSM, jadi coverage-nya bisa beda.
//
// Diporting dari SAPA (satu grup, logic identik) — butuh env var TOMTOM_API_KEY
// di Netlify site VISPM sendiri (Site settings → Environment variables).
// Kalau env var ini belum di-set di site VISPM, endpoint ini akan selalu
// balikin { lokasi: null } dan frontend otomatis fallback ke Nominatim/IP.
const { ok, err, cors } = require('./db');

// Tambahkan label (mis. "Kec.") di depan nama wilayah, kecuali nama itu
// sendiri sudah mengandung kata itu.
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

  // Kecamatan — municipalitySubdivision biasanya level kecamatan/kelurahan.
  // Kalau kosong, fallback ke municipality (di beberapa daerah TomTom cuma
  // ngasih data sampai level ini, mis. kecamatan-kecamatan di Banggai Laut).
  const kecamatanRaw = addr.municipalitySubdivision || addr.municipality;
  if (kecamatanRaw) {
    parts.push(_labelWilayah(kecamatanRaw, 'Kecamatan', 'kecamatan'));
  }

  // Kabupaten / Kota — countrySecondarySubdivision adalah level county/regency
  // yang sesuai sama hierarki resmi TomTom (municipality itu setingkat kota/
  // kecamatan, BUKAN kabupaten).
  // municipality cuma dipakai sbg fallback kalau countrySecondarySubdivision kosong.
  let kabKota = addr.countrySecondarySubdivision || addr.municipality;

  // Koreksi khusus Banggai Laut (lihat catatan _KEC_BANGGAI_LAUT di atas).
  if (kabKota && /^banggai$/i.test(kabKota.trim()) && _KEC_BANGGAI_LAUT.has((kecamatanRaw || '').trim().toLowerCase())) {
    kabKota = 'Banggai Laut';
  }

  if (kabKota && kabKota !== kecamatanRaw) {
    parts.push(/kota/i.test(kabKota) ? kabKota : _labelWilayah(kabKota, 'Kabupaten', 'kabupaten'));
  }

  // Provinsi
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
