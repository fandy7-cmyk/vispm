import { getDb, jsonResponse, errorResponse, parseBody } from './_db.js';
import { requireAuth, requireAdmin } from './_auth.js';

function normTarget(r) {
  if (r.target_tahun != null) r.target_tahun = parseFloat(r.target_tahun);
  if (r.target_display == null && r.target_tahun != null) r.target_display = null;
  r.bermakna_negatif = r.bermakna_negatif === true || r.bermakna_negatif === 'true';
  // Pastikan jenis_custom selalu array (Neon JSONB bisa datang sebagai string)
  if (typeof r.jenis_custom === 'string') {
    try { r.jenis_custom = JSON.parse(r.jenis_custom); } catch { r.jenis_custom = []; }
  }
  if (!Array.isArray(r.jenis_custom)) r.jenis_custom = [];
  return r;
}

function canInput(user, jenis) {
  if (!user) return false;
  if (user.is_admin) return true;
  const perms = user.permissions || [];
  if (jenis === 'monev') return perms.includes('kinerja.monev');
  if (jenis === 'ikk')   return perms.includes('kinerja.ikk');
  if (jenis === 'spm')   return perms.includes('kinerja.spm');
  // fallback: boleh jika punya salah satu
  return perms.includes('kinerja.monev') || perms.includes('kinerja.ikk') || perms.includes('kinerja.spm');
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({});

  const sql = getDb();
  const rawPath = event.path.replace(/.*\/kinerja/, '') || '/';
  const segments = rawPath.split('/').filter(Boolean);
  const sub = segments[0] || null;  // 'group' | 'indikator' | 'jenis-kinerja' | 'realisasi' | 'rekap'
  const id  = segments[1] && !isNaN(segments[1]) ? parseInt(segments[1]) : null;
  const qs  = event.queryStringParameters || {};

  // ─────────────────────────────────────────────────────────────────────────────
  // GROUP
  // ─────────────────────────────────────────────────────────────────────────────
  if (sub === 'group') {
    const auth = requireAuth(event);
    if (!auth) return errorResponse('Unauthorized', 401);

    // GET — semua yang login bisa baca (untuk dropdown di modal indikator)
    if (event.httpMethod === 'GET') {
      try {
        const rows = await sql`
          SELECT * FROM kinerja_group ORDER BY urutan ASC, id ASC
        `;
        return jsonResponse({ group: rows });
      } catch (err) {
        return errorResponse('Gagal mengambil group: ' + err.message);
      }
    }

    // Mutasi → admin only
    const admin = requireAdmin(event);
    if (!admin) return errorResponse('Unauthorized', 401);

    if (event.httpMethod === 'POST') {
      const { nama, jenis, urutan, aktif } = parseBody(event);
      if (!nama || !jenis) return errorResponse('Nama dan jenis wajib diisi', 400);
      const VALID_JENIS = ['tujuan', 'sasaran', 'program', 'kegiatan'];
      if (!VALID_JENIS.includes(jenis)) return errorResponse('Jenis tidak valid', 400);
      try {
        const rows = await sql`
          INSERT INTO kinerja_group (nama, jenis, urutan, aktif)
          VALUES (${nama}, ${jenis}, ${urutan || 0}, ${aktif !== false})
          RETURNING *
        `;
        return jsonResponse({ group: rows[0] }, 201);
      } catch (err) {
        return errorResponse('Gagal menyimpan group: ' + err.message);
      }
    }

    if (event.httpMethod === 'PUT' && id) {
      const { nama, jenis, urutan, aktif } = parseBody(event);
      if (jenis) {
        const VALID_JENIS = ['tujuan', 'sasaran', 'program', 'kegiatan'];
        if (!VALID_JENIS.includes(jenis)) return errorResponse('Jenis tidak valid', 400);
      }
      try {
        const rows = await sql`
          UPDATE kinerja_group SET
            nama       = COALESCE(${nama ?? null}, nama),
            jenis      = COALESCE(${jenis ?? null}, jenis),
            urutan     = COALESCE(${urutan ?? null}, urutan),
            aktif      = COALESCE(${aktif !== undefined ? aktif : null}, aktif),
            updated_at = NOW()
          WHERE id = ${id} RETURNING *
        `;
        if (!rows.length) return errorResponse('Group tidak ditemukan', 404);
        return jsonResponse({ group: rows[0] });
      } catch (err) {
        return errorResponse('Gagal mengupdate group: ' + err.message);
      }
    }

    if (event.httpMethod === 'DELETE' && id) {
      // Set group_id = NULL di indikator yang pakai group ini (tidak hapus indikator)
      await sql`UPDATE kinerja_indikator SET group_id = NULL WHERE group_id = ${id}`;
      await sql`DELETE FROM kinerja_group WHERE id = ${id}`;
      return jsonResponse({ ok: true });
    }

    return errorResponse('Not found', 404);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // JENIS KINERJA  —  /api/kinerja/jenis-kinerja
  // GET    → semua yang login bisa baca
  // POST   → admin only — tambah jenis baru
  // PUT    /jenis-kinerja/:id → admin only — edit
  // DELETE /jenis-kinerja/:id → admin only — hapus (cek dulu apakah masih dipakai)
  // ─────────────────────────────────────────────────────────────────────────────
  if (sub === 'jenis-kinerja') {
    const auth = requireAuth(event);
    if (!auth) return errorResponse('Unauthorized', 401);

    // Auto-migrate: buat tabel jika belum ada + kolom jenis_custom di kinerja_indikator
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS kinerja_jenis (
          id         SERIAL PRIMARY KEY,
          kode       TEXT UNIQUE NOT NULL,
          label      TEXT NOT NULL,
          deskripsi  TEXT,
          warna_bg   TEXT NOT NULL DEFAULT '#e2e8f0',
          warna_teks TEXT NOT NULL DEFAULT '#334155',
          urutan     INT  NOT NULL DEFAULT 0,
          aktif      BOOLEAN NOT NULL DEFAULT TRUE,
          is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;
      // Seed 3 jenis bawaan jika tabel baru dibuat / belum ada seed
      await sql`
        INSERT INTO kinerja_jenis (kode, label, warna_bg, warna_teks, urutan, aktif, is_builtin)
        VALUES
          ('iku', 'IKU', '#dbeafe', '#1e40af', 1, TRUE, TRUE),
          ('ikk',   'IKK', '#d1fae5', '#065f46', 2, TRUE, TRUE),
          ('spm',   'SPM', '#fef3c7', '#b45309', 3, TRUE, TRUE)
        ON CONFLICT (kode) DO NOTHING
      `;
      // Kolom jenis_custom (jsonb array of kode) untuk jenis di luar 3 builtin
      await sql`
        ALTER TABLE kinerja_indikator
          ADD COLUMN IF NOT EXISTS jenis_custom JSONB DEFAULT '[]'::jsonb
      `;
    } catch (migErr) {
      console.error('[jenis-kinerja migrate]', migErr);
    }

    // ── GET /api/kinerja/jenis-kinerja ─────────────────────────────────────
    if (event.httpMethod === 'GET') {
      try {
        const rows = await sql`
          SELECT * FROM kinerja_jenis ORDER BY urutan ASC, id ASC
        `;
        return jsonResponse({ jenis: rows });
      } catch (err) {
        return errorResponse('Gagal mengambil jenis kinerja: ' + err.message);
      }
    }

    // Mutasi → admin only
    const admin = requireAdmin(event);
    if (!admin) return errorResponse('Unauthorized', 401);

    // ── POST /api/kinerja/jenis-kinerja ────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const { label, deskripsi, warna_bg, warna_teks, urutan } = parseBody(event);
      if (!label?.trim()) return errorResponse('Label wajib diisi', 400);
      // Buat kode dari label: uppercase, alfanumerik, max 20 karakter
      const kode = label.trim().toUpperCase()
        .replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
        .substring(0, 20);
      try {
        const exist = await sql`SELECT id FROM kinerja_jenis WHERE kode = ${kode} LIMIT 1`;
        if (exist.length) return errorResponse(`Kode "${kode}" sudah ada. Gunakan label yang berbeda.`, 409);
        const rows = await sql`
          INSERT INTO kinerja_jenis (kode, label, deskripsi, warna_bg, warna_teks, urutan, aktif, is_builtin)
          VALUES (
            ${kode},
            ${label.trim()},
            ${deskripsi?.trim() || null},
            ${warna_bg  || '#e2e8f0'},
            ${warna_teks || '#334155'},
            ${urutan ?? 99},
            TRUE,
            FALSE
          )
          RETURNING *
        `;
        return jsonResponse({ jenis: rows[0] }, 201);
      } catch (err) {
        return errorResponse('Gagal menyimpan jenis: ' + err.message);
      }
    }

    // ── PUT /api/kinerja/jenis-kinerja/:id ─────────────────────────────────
    if (event.httpMethod === 'PUT' && id) {
      const { label, deskripsi, warna_bg, warna_teks, urutan, aktif } = parseBody(event);
      try {
        const rows = await sql`
          UPDATE kinerja_jenis SET
            label      = COALESCE(${label?.trim() ?? null}, label),
            deskripsi  = ${deskripsi !== undefined ? (deskripsi?.trim() || null) : sql`deskripsi`},
            warna_bg   = COALESCE(${warna_bg  ?? null}, warna_bg),
            warna_teks = COALESCE(${warna_teks ?? null}, warna_teks),
            urutan     = COALESCE(${urutan ?? null}, urutan),
            aktif      = COALESCE(${aktif !== undefined ? aktif : null}, aktif),
            updated_at = NOW()
          WHERE id = ${id} RETURNING *
        `;
        if (!rows.length) return errorResponse('Jenis tidak ditemukan', 404);
        return jsonResponse({ jenis: rows[0] });
      } catch (err) {
        return errorResponse('Gagal mengupdate jenis: ' + err.message);
      }
    }

    // ── DELETE /api/kinerja/jenis-kinerja/:id ──────────────────────────────
    if (event.httpMethod === 'DELETE' && id) {
      const force = qs.force === '1';
      try {
        const jenis = await sql`SELECT * FROM kinerja_jenis WHERE id = ${id} LIMIT 1`;
        if (!jenis.length) return errorResponse('Jenis tidak ditemukan', 404);
        if (jenis[0].is_builtin) return errorResponse('Jenis bawaan sistem tidak dapat dihapus', 403);

        const kode = jenis[0].kode;
        // Hitung indikator yang pakai jenis ini (via jenis_custom jsonb)
        const usage = await sql`
          SELECT id, indikator_kinerja FROM kinerja_indikator
          WHERE jenis_custom @> ${JSON.stringify([kode])}::jsonb
        `;
        if (usage.length > 0 && !force) {
          return jsonResponse({
            error: 'JENIS_MASIH_DIPAKAI',
            count: usage.length,
            indikator: usage.map(r => ({ id: r.id, nama: r.indikator_kinerja })),
          }, 409);
        }
        // force=1: bersihkan jenis dari semua indikator dulu
        if (usage.length > 0 && force) {
          for (const ind of usage) {
            await sql`
              UPDATE kinerja_indikator
              SET jenis_custom = (
                SELECT jsonb_agg(elem)
                FROM jsonb_array_elements_text(COALESCE(jenis_custom,'[]'::jsonb)) AS elem
                WHERE elem <> ${kode}
              )
              WHERE id = ${ind.id}
            `;
          }
        }
        await sql`DELETE FROM kinerja_jenis WHERE id = ${id}`;
        return jsonResponse({ ok: true });
      } catch (err) {
        return errorResponse('Gagal menghapus jenis: ' + err.message);
      }
    }

    return errorResponse('Not found', 404);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INDIKATOR
  // ─────────────────────────────────────────────────────────────────────────────
  if (sub === 'indikator') {
    // GET — semua yang login bisa baca
    if (event.httpMethod === 'GET') {
      const auth = requireAuth(event);
      if (!auth) return errorResponse('Unauthorized', 401);
      try {
        const rows = await sql`
          SELECT
            ki.*,
            kg.nama  AS group_nama,
            kg.jenis AS group_jenis,
            COALESCE(
              (
                SELECT ARRAY_AGG(u.nama ORDER BY u.nama)
                FROM user_indikator uik
                JOIN users u ON u.id = uik.user_id
                WHERE uik.indikator_id = ki.id
              ), '{}'
            ) AS pic_users
          FROM kinerja_indikator ki
          LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
          ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC
        `;
        return jsonResponse({ indikator: rows.map(normTarget) });
      } catch (err) {
        console.error('[GET kinerja/indikator]', err);
        return errorResponse('Gagal mengambil indikator: ' + err.message);
      }
    }

    const admin = requireAdmin(event);
    if (!admin) return errorResponse('Unauthorized', 401);

    if (event.httpMethod === 'POST') {
      const {
        group_id, sasaran, indikator_kinerja, satuan,
        penanggung_jawab, bermakna_negatif, urutan, aktif,
        jenis_monev, jenis_ikk, jenis_spm, jenis_custom, formula
      } = parseBody(event);
      if (!indikator_kinerja || !satuan) {
        return errorResponse('Indikator kinerja dan satuan wajib diisi', 400);
      }
      const jenisCustomVal = Array.isArray(jenis_custom) ? JSON.stringify(jenis_custom) : '[]';
      try {
        const rows = await sql`
          INSERT INTO kinerja_indikator
            (group_id, sasaran, indikator_kinerja, satuan,
             penanggung_jawab, bermakna_negatif, urutan, aktif,
             jenis_monev, jenis_ikk, jenis_spm, jenis_custom, formula)
          VALUES
            (${group_id || null}, ${sasaran || null}, ${indikator_kinerja},
             ${satuan}, ${penanggung_jawab || null},
             ${bermakna_negatif === true}, ${urutan || 0}, ${aktif !== false},
             ${jenis_monev === true}, ${jenis_ikk === true}, ${jenis_spm === true},
             ${jenisCustomVal}::jsonb, ${formula || null})
          RETURNING *
        `;
        return jsonResponse({ indikator: normTarget(rows[0]) }, 201);
      } catch (err) {
        return errorResponse('Gagal menyimpan indikator: ' + err.message);
      }
    }

    if (event.httpMethod === 'PUT' && id) {
      const {
        group_id, sasaran, indikator_kinerja, satuan,
        penanggung_jawab, bermakna_negatif, urutan, aktif,
        jenis_monev, jenis_ikk, jenis_spm, jenis_custom, formula
      } = parseBody(event);
      // jenis_custom selalu dikirim dari client (saveIndikator), normalize sama seperti POST
      const jenisCustomVal = Array.isArray(jenis_custom) ? JSON.stringify(jenis_custom) : '[]';
      try {
        const rows = await sql`
          UPDATE kinerja_indikator SET
            group_id          = ${group_id !== undefined ? group_id : sql`group_id`},
            sasaran           = ${sasaran !== undefined ? sasaran : sql`sasaran`},
            indikator_kinerja = COALESCE(${indikator_kinerja ?? null}, indikator_kinerja),
            satuan            = COALESCE(${satuan ?? null}, satuan),
            penanggung_jawab  = ${penanggung_jawab !== undefined ? penanggung_jawab : sql`penanggung_jawab`},
            bermakna_negatif  = ${bermakna_negatif !== undefined ? bermakna_negatif === true : sql`bermakna_negatif`},
            urutan            = COALESCE(${urutan ?? null}, urutan),
            aktif             = COALESCE(${aktif !== undefined ? aktif : null}, aktif),
            jenis_monev       = ${jenis_monev !== undefined ? jenis_monev === true : sql`jenis_monev`},
            jenis_ikk         = ${jenis_ikk !== undefined ? jenis_ikk === true : sql`jenis_ikk`},
            jenis_spm         = ${jenis_spm !== undefined ? jenis_spm === true : sql`jenis_spm`},
            jenis_custom      = ${jenisCustomVal}::jsonb,
            formula           = ${formula !== undefined ? (formula || null) : sql`formula`},
            updated_at        = NOW()
          WHERE id = ${id} RETURNING *
        `;
        if (!rows.length) return errorResponse('Indikator tidak ditemukan', 404);
        return jsonResponse({ indikator: normTarget(rows[0]) });
      } catch (err) {
        return errorResponse('Gagal mengupdate indikator: ' + err.message);
      }
    }

    if (event.httpMethod === 'DELETE' && id) {
      await sql`DELETE FROM kinerja_realisasi WHERE indikator_id = ${id}`;
      await sql`DELETE FROM kinerja_target WHERE indikator_id = ${id}`;
      await sql`DELETE FROM kinerja_indikator WHERE id = ${id}`;
      return jsonResponse({ ok: true });
    }

    return errorResponse('Not found', 404);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TARGET PER TAHUN
  // GET    /api/kinerja/target?indikator_id=X  → list target untuk 1 indikator
  // GET    /api/kinerja/target?all=1           → semua target (admin, untuk tabel kelola)
  // POST   /api/kinerja/target                 → upsert target (admin)
  // DELETE /api/kinerja/target/:id             → hapus 1 baris target (admin)
  // ─────────────────────────────────────────────────────────────────────────────
  if (sub === 'target') {
    if (event.httpMethod === 'GET') {
      const auth = requireAuth(event);
      if (!auth) return errorResponse('Unauthorized', 401);

      // GET semua target sekaligus (untuk tabel admin)
      if (qs.all === '1') {
        try {
          const rows = await sql`
            SELECT * FROM kinerja_target ORDER BY indikator_id ASC, tahun ASC
          `;
          return jsonResponse({ target: rows.map(r => ({ ...r, target: r.target != null ? parseFloat(r.target) : null })) });
        } catch (err) {
          return errorResponse('Gagal mengambil semua target: ' + err.message);
        }
      }

      const indId = qs.indikator_id ? parseInt(qs.indikator_id) : null;
      if (!indId) return errorResponse('indikator_id wajib', 400);
      try {
        const rows = await sql`
          SELECT * FROM kinerja_target WHERE indikator_id = ${indId} ORDER BY tahun ASC
        `;
        return jsonResponse({ target: rows.map(r => ({ ...r, target: r.target != null ? parseFloat(r.target) : null })) });
      } catch (err) {
        return errorResponse('Gagal mengambil target: ' + err.message);
      }
    }

    const admin = requireAdmin(event);
    if (!admin) return errorResponse('Unauthorized', 401);

    // POST: upsert satu baris target (indikator_id + tahun → upsert)
    if (event.httpMethod === 'POST') {
      const { indikator_id, tahun, target, target_display } = parseBody(event);
      if (!indikator_id || !tahun) return errorResponse('indikator_id dan tahun wajib', 400);
      const targetNum = target !== undefined && target !== '' ? parseFloat(String(target).replace(/[^0-9.\-]/g,'')) : null;
      const targetDisp = target_display != null && String(target_display).trim() !== '' ? String(target_display).trim() : null;
      try {
        const rows = await sql`
          INSERT INTO kinerja_target (indikator_id, tahun, target, target_display)
          VALUES (${parseInt(indikator_id)}, ${parseInt(tahun)}, ${targetNum}, ${targetDisp})
          ON CONFLICT (indikator_id, tahun)
          DO UPDATE SET
            target         = EXCLUDED.target,
            target_display = EXCLUDED.target_display,
            updated_at     = NOW()
          RETURNING *
        `;
        return jsonResponse({ target: rows[0] }, 201);
      } catch (err) {
        return errorResponse('Gagal menyimpan target: ' + err.message);
      }
    }

    // PUT /api/kinerja/target/:id  → update target_display & target untuk 1 baris
    if (event.httpMethod === 'PUT' && id) {
      const { target, target_display } = parseBody(event);
      const targetNum = target !== undefined && target !== '' && target !== null
        ? parseFloat(String(target).replace(/[^0-9.\-]/g,'')) : null;
      const targetDisp = target_display != null && String(target_display).trim() !== '' ? String(target_display).trim() : null;
      try {
        const rows = await sql`
          UPDATE kinerja_target
          SET target = ${targetNum}, target_display = ${targetDisp}, updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `;
        if (!rows.length) return errorResponse('Target tidak ditemukan', 404);
        return jsonResponse({ target: { ...rows[0], target: rows[0].target != null ? parseFloat(rows[0].target) : null } });
      } catch (err) {
        return errorResponse('Gagal memperbarui target: ' + err.message);
      }
    }

    // DELETE /api/kinerja/target/:id
    if (event.httpMethod === 'DELETE' && id) {
      try {
        await sql`DELETE FROM kinerja_target WHERE id = ${id}`;
        return jsonResponse({ ok: true });
      } catch (err) {
        return errorResponse('Gagal menghapus target: ' + err.message);
      }
    }

    return errorResponse('Not found', 404);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // REALISASI
  // ─────────────────────────────────────────────────────────────────────────────
  if (sub === 'realisasi') {
    const auth = requireAuth(event);
    if (!auth) return errorResponse('Unauthorized', 401);

    let user = auth;
    if (!auth.is_admin) {
      try {
        const perms = await sql`SELECT menu_key FROM user_permissions WHERE user_id = ${auth.id}`;
        user = { ...auth, permissions: perms.map(p => p.menu_key) };
      } catch { user = { ...auth, permissions: [] }; }
    }

    if (event.httpMethod === 'GET') {
      const { bulan, tahun } = qs;
      try {
        let rows;
        if (bulan && tahun) {
          rows = await sql`
            SELECT * FROM kinerja_realisasi
            WHERE bulan = ${parseInt(bulan)} AND tahun = ${parseInt(tahun)}
          `;
        } else if (tahun) {
          rows = await sql`SELECT * FROM kinerja_realisasi WHERE tahun = ${parseInt(tahun)}`;
        } else {
          rows = await sql`SELECT * FROM kinerja_realisasi ORDER BY tahun DESC, bulan DESC`;
        }
        return jsonResponse({ realisasi: rows });
      } catch (err) {
        return errorResponse('Gagal mengambil realisasi: ' + err.message);
      }
    }

    if (!canInput(user, null)) return errorResponse('Akses ditolak', 403);

    if (event.httpMethod === 'POST') {
      const { indikator_id, bulan, tahun, realisasi, realisasi_display, f_penghambat, solusi, f_pendukung, rencana_tl, data_dukung_url, data_dukung_nama, clear_data_dukung } = parseBody(event);
      if (!indikator_id || !bulan || !tahun) {
        return errorResponse('indikator_id, bulan, dan tahun wajib diisi', 400);
      }

      // ── Validasi window periode (non-admin) ────────────────────────────────
      // Cek periode sesuai jenis indikator: jenis_monev → 'monev', jenis_ikk → 'ikk'
      if (!auth.is_admin) {
        try {
          // Ambil jenis indikator yang diinput
          const indikRows = await sql`
            SELECT jenis_monev, jenis_ikk, jenis_spm FROM kinerja_indikator
            WHERE id = ${parseInt(indikator_id)} LIMIT 1
          `;
          if (indikRows.length) {
            const { jenis_monev, jenis_ikk, jenis_spm } = indikRows[0];
            const jenisList = [];
            if (jenis_monev) jenisList.push('monev');
            if (jenis_ikk)   jenisList.push('ikk');
            if (jenis_spm)   jenisList.push('spm');

            // Cek permission per jenis indikator
            for (const j of jenisList) {
              if (!canInput(user, j)) {
                const label = j === 'monev' ? 'IKU' : j === 'ikk' ? 'IKK' : 'SPM';
                return errorResponse(`Akses ditolak: Anda tidak memiliki izin untuk input ${label}`, 403);
              }
            }

            // Hanya cek jika indikator punya jenis yang terdefinisi
            if (jenisList.length > 0) {
              const periodeRows = await sql`
                SELECT open_at, close_at, jenis FROM periode
                WHERE bulan = ${parseInt(bulan)} AND tahun = ${parseInt(tahun)}
                  AND jenis = ANY(${jenisList})
                  AND open_at <= NOW() AND close_at >= NOW()
                LIMIT 1
              `;
              if (!periodeRows.length) {
                // Cari yang ada untuk pesan error lebih informatif
                const anyPeriode = await sql`
                  SELECT open_at, close_at, jenis FROM periode
                  WHERE bulan = ${parseInt(bulan)} AND tahun = ${parseInt(tahun)}
                    AND jenis = ANY(${jenisList})
                  LIMIT 1
                `;
                const jenisLabel = jenisList.includes('monev') ? 'IKU' : jenisList.includes('ikk') ? 'IKK' : 'SPM';
                if (!anyPeriode.length) {
                  return errorResponse(`Periode ${jenisLabel} untuk bulan ini tidak ditemukan.`, 403);
                }
                const p     = anyPeriode[0];
                const now   = Date.now();
                const open  = p.open_at  ? new Date(p.open_at).getTime()  : null;
                const close = p.close_at ? new Date(p.close_at).getTime() : null;
                if (open && now < open)   return errorResponse(`Periode input ${jenisLabel} belum dibuka.`, 403);
                if (close && now > close) return errorResponse(`Periode input ${jenisLabel} sudah ditutup. Data tidak dapat diubah.`, 403);
                return errorResponse(`Window input ${jenisLabel} untuk bulan ini belum dibuka.`, 403);
              }
              // periodeRows.length > 0 → window terbuka, boleh lanjut
            }
          }
        } catch (err) {
          console.warn('[kinerja/realisasi] Gagal cek window periode:', err.message);
        }
      }
      // ─────────────────────────────────────────────────────────────────────
      try {
        const rows = await sql`
          INSERT INTO kinerja_realisasi
            (indikator_id, bulan, tahun, realisasi, realisasi_display, f_penghambat, solusi, f_pendukung, rencana_tl, data_dukung_url, data_dukung_nama, diisi_oleh)
          VALUES
            (${parseInt(indikator_id)}, ${parseInt(bulan)}, ${parseInt(tahun)},
             ${realisasi ?? null}, ${realisasi_display != null ? String(realisasi_display) : null},
             ${f_penghambat || null}, ${solusi || null}, ${f_pendukung || null}, ${rencana_tl || null},
             ${data_dukung_url ?? null}, ${data_dukung_nama ?? null}, ${auth.id})
          ON CONFLICT (indikator_id, bulan, tahun) DO UPDATE SET
            realisasi         = COALESCE(EXCLUDED.realisasi, kinerja_realisasi.realisasi),
            realisasi_display = COALESCE(EXCLUDED.realisasi_display, kinerja_realisasi.realisasi_display),
            f_penghambat      = COALESCE(EXCLUDED.f_penghambat, kinerja_realisasi.f_penghambat),
            solusi            = COALESCE(EXCLUDED.solusi, kinerja_realisasi.solusi),
            f_pendukung       = COALESCE(EXCLUDED.f_pendukung, kinerja_realisasi.f_pendukung),
            rencana_tl        = COALESCE(EXCLUDED.rencana_tl, kinerja_realisasi.rencana_tl),
            data_dukung_url   = CASE
              WHEN ${!!clear_data_dukung} THEN NULL
              WHEN EXCLUDED.data_dukung_url IS NOT NULL THEN EXCLUDED.data_dukung_url
              ELSE kinerja_realisasi.data_dukung_url END,
            data_dukung_nama  = CASE
              WHEN ${!!clear_data_dukung} THEN NULL
              WHEN EXCLUDED.data_dukung_nama IS NOT NULL THEN EXCLUDED.data_dukung_nama
              ELSE kinerja_realisasi.data_dukung_nama END,
            diisi_oleh        = EXCLUDED.diisi_oleh,
            updated_at        = NOW()
          RETURNING *
        `;
        return jsonResponse({ realisasi: rows[0] });
      } catch (err) {
        return errorResponse('Gagal menyimpan realisasi: ' + err.message);
      }
    }

    if (event.httpMethod === 'PUT' && id) {
      if (!auth.is_admin) return errorResponse('Akses ditolak', 403);
      const { realisasi, realisasi_display, f_penghambat, solusi, f_pendukung, rencana_tl } = parseBody(event);
      try {
        const rows = await sql`
          UPDATE kinerja_realisasi SET
            realisasi         = ${realisasi ?? null},
            realisasi_display = ${realisasi_display !== undefined ? (realisasi_display != null ? String(realisasi_display) : null) : sql`realisasi_display`},
            f_penghambat      = ${f_penghambat !== undefined ? f_penghambat : sql`f_penghambat`},
            solusi            = ${solusi !== undefined ? solusi : sql`solusi`},
            f_pendukung       = ${f_pendukung !== undefined ? f_pendukung : sql`f_pendukung`},
            rencana_tl        = ${rencana_tl !== undefined ? rencana_tl : sql`rencana_tl`},
            updated_at        = NOW()
          WHERE id = ${id} RETURNING *
        `;
        if (!rows.length) return errorResponse('Realisasi tidak ditemukan', 404);
        return jsonResponse({ realisasi: rows[0] });
      } catch (err) {
        return errorResponse('Gagal update realisasi: ' + err.message);
      }
    }

    if (event.httpMethod === 'DELETE' && id) {
      if (!auth.is_admin) return errorResponse('Akses ditolak', 403);
      await sql`DELETE FROM kinerja_realisasi WHERE id = ${id}`;
      return jsonResponse({ ok: true });
    }

    return errorResponse('Not found', 404);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // REKAP/TAHUN-LIST — daftar distinct tahun yang punya data realisasi
  // (harus dicek SEBELUM blok 'rekap' biasa, karena keduanya sama-sama
  //  punya sub === 'rekap'; bedanya cuma di segments[1])
  // ─────────────────────────────────────────────────────────────────────────────
  if (sub === 'rekap' && segments[1] === 'tahun-list') {
    const auth = requireAuth(event);
    if (!auth) return errorResponse('Unauthorized', 401);
    try {
      const rows = await sql`
        SELECT DISTINCT tahun FROM kinerja_realisasi ORDER BY tahun ASC
      `;
      return jsonResponse({ tahun: rows.map(r => r.tahun) });
    } catch (err) {
      return errorResponse('Gagal mengambil daftar tahun: ' + err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // REKAP — join group + indikator + realisasi
  // ─────────────────────────────────────────────────────────────────────────────
  if (sub === 'rekap') {
    const auth = requireAuth(event);
    if (!auth) return errorResponse('Unauthorized', 401);

    const bulan = parseInt(qs.bulan || new Date().getMonth() + 1);
    const tahun = parseInt(qs.tahun || new Date().getFullYear());
    const jenis = qs.jenis || 'monev'; // 'monev' | 'ikk' | 'spm'

    // Untuk non-admin:
    // - IKU (jenis=monev): tampilkan SEMUA indikator IKU (indikator utama kadis, semua user boleh lihat)
    // - IKK / SPM: hanya tampilkan indikator yang di-assign via user_indikator
    let bidangNama = null;
    let userIndikatorIds = null; // null = tampil semua; array = filter per id
    if (!auth.is_admin && jenis !== 'monev') {
      try {
        const assignRows = await sql`
          SELECT indikator_id FROM user_indikator WHERE user_id = ${auth.id}
        `;
        if (assignRows.length > 0) {
          userIndikatorIds = assignRows.map(r => r.indikator_id);
        } else {
          // Tidak ada assignment → return kosong, tidak ada fallback
          return jsonResponse({ rekap: [], bulan, tahun, no_assignment: true });
        }
      } catch (_) {
        return jsonResponse({ rekap: [], bulan, tahun, no_assignment: true });
      }
    }

    try {
      const rows = jenis === 'ikk'
        ? auth.is_admin
          ? await sql`
            SELECT
              ki.id,
              ki.group_id,
              kg.nama       AS group_nama,
              kg.jenis      AS group_jenis,
              kg.urutan     AS group_urutan,
              ki.sasaran,
              ki.indikator_kinerja,
              ki.satuan,
              kt.target        AS target_tahun,
              kt.target_display AS target_display,
              ki.penanggung_jawab,
              ki.bermakna_negatif,
              ki.urutan,
              ki.jenis_monev,
              ki.jenis_ikk,
              ki.jenis_spm,
              ki.formula,
              kr.id         AS realisasi_id,
              kr.realisasi,
              kr.realisasi_display,
              kr.f_penghambat,
              kr.solusi,
              kr.f_pendukung,
              kr.rencana_tl,
              kr.data_dukung_url,
              kr.data_dukung_nama,
              kr.diisi_oleh,
              kr.updated_at AS realisasi_updated_at,
              CASE
                WHEN COALESCE(
                       CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                            THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                  WHERE krc.indikator_id = ki.id
                                    AND krc.tahun = ${tahun}
                                    AND krc.bulan <= ${bulan})
                            ELSE kr.realisasi END,
                       kr.realisasi
                     ) IS NULL OR kt.target IS NULL OR kt.target = 0
                  THEN NULL
                WHEN ki.bermakna_negatif = TRUE
                  THEN ROUND(
                    (kt.target::NUMERIC - (
                      COALESCE(
                        CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                             THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                   WHERE krc.indikator_id = ki.id
                                     AND krc.tahun = ${tahun}
                                     AND krc.bulan <= ${bulan})::NUMERIC
                             ELSE kr.realisasi::NUMERIC END,
                        kr.realisasi::NUMERIC
                      ) - kt.target::NUMERIC
                    ))
                    / kt.target::NUMERIC * 100, 2
                  )
                ELSE
                  ROUND(
                    COALESCE(
                      CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                           THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                 WHERE krc.indikator_id = ki.id
                                   AND krc.tahun = ${tahun}
                                   AND krc.bulan <= ${bulan})::NUMERIC
                           ELSE kr.realisasi::NUMERIC END,
                      kr.realisasi::NUMERIC
                    ) / kt.target::NUMERIC * 100, 2
                  )
              END AS capaian_persen
            FROM kinerja_indikator ki
            LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
            LEFT JOIN kinerja_realisasi kr
              ON kr.indikator_id = ki.id
             AND kr.bulan  = ${bulan}
             AND kr.tahun  = ${tahun}
            LEFT JOIN kinerja_target kt
              ON kt.indikator_id = ki.id
             AND kt.tahun        = ${tahun}
            WHERE ki.aktif = TRUE
              AND ki.jenis_ikk = TRUE
            ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC
          `
          : userIndikatorIds !== null
          ? await sql`
            SELECT
              ki.id,
              ki.group_id,
              kg.nama       AS group_nama,
              kg.jenis      AS group_jenis,
              kg.urutan     AS group_urutan,
              ki.sasaran,
              ki.indikator_kinerja,
              ki.satuan,
              kt.target        AS target_tahun,
              kt.target_display AS target_display,
              ki.penanggung_jawab,
              ki.bermakna_negatif,
              ki.urutan,
              ki.jenis_monev,
              ki.jenis_ikk,
              ki.jenis_spm,
              ki.formula,
              kr.id         AS realisasi_id,
              kr.realisasi,
              kr.realisasi_display,
              kr.f_penghambat,
              kr.solusi,
              kr.f_pendukung,
              kr.rencana_tl,
              kr.data_dukung_url,
              kr.data_dukung_nama,
              kr.diisi_oleh,
              kr.updated_at AS realisasi_updated_at,
              CASE
                WHEN COALESCE(
                       CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                            THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                  WHERE krc.indikator_id = ki.id
                                    AND krc.tahun = ${tahun}
                                    AND krc.bulan <= ${bulan})
                            ELSE kr.realisasi END,
                       kr.realisasi
                     ) IS NULL OR kt.target IS NULL OR kt.target = 0
                  THEN NULL
                WHEN ki.bermakna_negatif = TRUE
                  THEN ROUND(
                    (kt.target::NUMERIC - (
                      COALESCE(
                        CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                             THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                   WHERE krc.indikator_id = ki.id
                                     AND krc.tahun = ${tahun}
                                     AND krc.bulan <= ${bulan})::NUMERIC
                             ELSE kr.realisasi::NUMERIC END,
                        kr.realisasi::NUMERIC
                      ) - kt.target::NUMERIC
                    ))
                    / kt.target::NUMERIC * 100, 2
                  )
                ELSE
                  ROUND(
                    COALESCE(
                      CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                           THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                 WHERE krc.indikator_id = ki.id
                                   AND krc.tahun = ${tahun}
                                   AND krc.bulan <= ${bulan})::NUMERIC
                           ELSE kr.realisasi::NUMERIC END,
                      kr.realisasi::NUMERIC
                    ) / kt.target::NUMERIC * 100, 2
                  )
              END AS capaian_persen
            FROM kinerja_indikator ki
            LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
            LEFT JOIN kinerja_realisasi kr
              ON kr.indikator_id = ki.id
             AND kr.bulan  = ${bulan}
             AND kr.tahun  = ${tahun}
            LEFT JOIN kinerja_target kt
              ON kt.indikator_id = ki.id
             AND kt.tahun        = ${tahun}
            WHERE ki.aktif = TRUE
              AND ki.jenis_ikk = TRUE
              AND ki.id = ANY(${userIndikatorIds})
            ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC
          `
          : await sql`
            SELECT
              ki.id,
              ki.group_id,
              kg.nama       AS group_nama,
              kg.jenis      AS group_jenis,
              kg.urutan     AS group_urutan,
              ki.sasaran,
              ki.indikator_kinerja,
              ki.satuan,
              kt.target        AS target_tahun,
              kt.target_display AS target_display,
              ki.penanggung_jawab,
              ki.bermakna_negatif,
              ki.urutan,
              ki.jenis_monev,
              ki.jenis_ikk,
              ki.jenis_spm,
              ki.formula,
              kr.id         AS realisasi_id,
              kr.realisasi,
              kr.realisasi_display,
              kr.f_penghambat,
              kr.solusi,
              kr.f_pendukung,
              kr.rencana_tl,
              kr.data_dukung_url,
              kr.data_dukung_nama,
              kr.diisi_oleh,
              kr.updated_at AS realisasi_updated_at,
              CASE
                WHEN COALESCE(
                       CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                            THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                  WHERE krc.indikator_id = ki.id
                                    AND krc.tahun = ${tahun}
                                    AND krc.bulan <= ${bulan})
                            ELSE kr.realisasi END,
                       kr.realisasi
                     ) IS NULL OR kt.target IS NULL OR kt.target = 0
                  THEN NULL
                WHEN ki.bermakna_negatif = TRUE
                  THEN ROUND(
                    (kt.target::NUMERIC - (
                      COALESCE(
                        CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                             THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                   WHERE krc.indikator_id = ki.id
                                     AND krc.tahun = ${tahun}
                                     AND krc.bulan <= ${bulan})::NUMERIC
                             ELSE kr.realisasi::NUMERIC END,
                        kr.realisasi::NUMERIC
                      ) - kt.target::NUMERIC
                    ))
                    / kt.target::NUMERIC * 100, 2
                  )
                ELSE
                  ROUND(
                    COALESCE(
                      CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                           THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                 WHERE krc.indikator_id = ki.id
                                   AND krc.tahun = ${tahun}
                                   AND krc.bulan <= ${bulan})::NUMERIC
                           ELSE kr.realisasi::NUMERIC END,
                      kr.realisasi::NUMERIC
                    ) / kt.target::NUMERIC * 100, 2
                  )
              END AS capaian_persen
            FROM kinerja_indikator ki
            LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
            LEFT JOIN kinerja_realisasi kr
              ON kr.indikator_id = ki.id
             AND kr.bulan  = ${bulan}
             AND kr.tahun  = ${tahun}
            LEFT JOIN kinerja_target kt
              ON kt.indikator_id = ki.id
             AND kt.tahun        = ${tahun}
            WHERE ki.aktif = TRUE
              AND ki.jenis_ikk = TRUE
              AND ki.penanggung_jawab = ${bidangNama}
            ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC
          `
        : jenis === 'spm'
        ? auth.is_admin
          ? await sql`
            SELECT
              ki.id,
              ki.group_id,
              kg.nama       AS group_nama,
              kg.jenis      AS group_jenis,
              kg.urutan     AS group_urutan,
              ki.sasaran,
              ki.indikator_kinerja,
              ki.satuan,
              kt.target        AS target_tahun,
              kt.target_display AS target_display,
              ki.penanggung_jawab,
              ki.bermakna_negatif,
              ki.urutan,
              ki.jenis_monev,
              ki.jenis_ikk,
              ki.jenis_spm,
              ki.formula,
              kr.id         AS realisasi_id,
              kr.realisasi,
              kr.realisasi_display,
              kr.f_penghambat,
              kr.solusi,
              kr.f_pendukung,
              kr.rencana_tl,
              kr.data_dukung_url,
              kr.data_dukung_nama,
              kr.diisi_oleh,
              kr.updated_at AS realisasi_updated_at,
              CASE
                WHEN COALESCE(
                       CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                            THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                  WHERE krc.indikator_id = ki.id
                                    AND krc.tahun = ${tahun}
                                    AND krc.bulan <= ${bulan})
                            ELSE kr.realisasi END,
                       kr.realisasi
                     ) IS NULL OR kt.target IS NULL OR kt.target = 0
                  THEN NULL
                WHEN ki.bermakna_negatif = TRUE
                  THEN ROUND(
                    (kt.target::NUMERIC - (
                      COALESCE(
                        CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                             THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                   WHERE krc.indikator_id = ki.id
                                     AND krc.tahun = ${tahun}
                                     AND krc.bulan <= ${bulan})::NUMERIC
                             ELSE kr.realisasi::NUMERIC END,
                        kr.realisasi::NUMERIC
                      ) - kt.target::NUMERIC
                    ))
                    / kt.target::NUMERIC * 100, 2
                  )
                ELSE
                  ROUND(
                    COALESCE(
                      CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                           THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                 WHERE krc.indikator_id = ki.id
                                   AND krc.tahun = ${tahun}
                                   AND krc.bulan <= ${bulan})::NUMERIC
                           ELSE kr.realisasi::NUMERIC END,
                      kr.realisasi::NUMERIC
                    ) / kt.target::NUMERIC * 100, 2
                  )
              END AS capaian_persen
            FROM kinerja_indikator ki
            LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
            LEFT JOIN kinerja_realisasi kr
              ON kr.indikator_id = ki.id
             AND kr.bulan  = ${bulan}
             AND kr.tahun  = ${tahun}
            LEFT JOIN kinerja_target kt
              ON kt.indikator_id = ki.id
             AND kt.tahun        = ${tahun}
            WHERE ki.aktif = TRUE
              AND ki.jenis_spm = TRUE
            ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC
          `
          : userIndikatorIds !== null
          ? await sql`
            SELECT
              ki.id,
              ki.group_id,
              kg.nama       AS group_nama,
              kg.jenis      AS group_jenis,
              kg.urutan     AS group_urutan,
              ki.sasaran,
              ki.indikator_kinerja,
              ki.satuan,
              kt.target        AS target_tahun,
              kt.target_display AS target_display,
              ki.penanggung_jawab,
              ki.bermakna_negatif,
              ki.urutan,
              ki.jenis_monev,
              ki.jenis_ikk,
              ki.jenis_spm,
              ki.formula,
              kr.id         AS realisasi_id,
              kr.realisasi,
              kr.realisasi_display,
              kr.f_penghambat,
              kr.solusi,
              kr.f_pendukung,
              kr.rencana_tl,
              kr.data_dukung_url,
              kr.data_dukung_nama,
              kr.diisi_oleh,
              kr.updated_at AS realisasi_updated_at,
              CASE
                WHEN COALESCE(
                       CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                            THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                  WHERE krc.indikator_id = ki.id
                                    AND krc.tahun = ${tahun}
                                    AND krc.bulan <= ${bulan})
                            ELSE kr.realisasi END,
                       kr.realisasi
                     ) IS NULL OR kt.target IS NULL OR kt.target = 0
                  THEN NULL
                WHEN ki.bermakna_negatif = TRUE
                  THEN ROUND(
                    (kt.target::NUMERIC - (
                      COALESCE(
                        CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                             THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                   WHERE krc.indikator_id = ki.id
                                     AND krc.tahun = ${tahun}
                                     AND krc.bulan <= ${bulan})::NUMERIC
                             ELSE kr.realisasi::NUMERIC END,
                        kr.realisasi::NUMERIC
                      ) - kt.target::NUMERIC
                    ))
                    / kt.target::NUMERIC * 100, 2
                  )
                ELSE
                  ROUND(
                    COALESCE(
                      CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                           THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                 WHERE krc.indikator_id = ki.id
                                   AND krc.tahun = ${tahun}
                                   AND krc.bulan <= ${bulan})::NUMERIC
                           ELSE kr.realisasi::NUMERIC END,
                      kr.realisasi::NUMERIC
                    ) / kt.target::NUMERIC * 100, 2
                  )
              END AS capaian_persen
            FROM kinerja_indikator ki
            LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
            LEFT JOIN kinerja_realisasi kr
              ON kr.indikator_id = ki.id
             AND kr.bulan  = ${bulan}
             AND kr.tahun  = ${tahun}
            LEFT JOIN kinerja_target kt
              ON kt.indikator_id = ki.id
             AND kt.tahun        = ${tahun}
            WHERE ki.aktif = TRUE
              AND ki.jenis_spm = TRUE
              AND ki.id = ANY(${userIndikatorIds !== null ? userIndikatorIds : [-1]})
            ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC
          `
          : await sql`
            SELECT
              ki.id,
              ki.group_id,
              kg.nama       AS group_nama,
              kg.jenis      AS group_jenis,
              kg.urutan     AS group_urutan,
              ki.sasaran,
              ki.indikator_kinerja,
              ki.satuan,
              kt.target        AS target_tahun,
              kt.target_display AS target_display,
              ki.penanggung_jawab,
              ki.bermakna_negatif,
              ki.urutan,
              ki.jenis_monev,
              ki.jenis_ikk,
              ki.jenis_spm,
              ki.formula,
              kr.id         AS realisasi_id,
              kr.realisasi,
              kr.realisasi_display,
              kr.f_penghambat,
              kr.solusi,
              kr.f_pendukung,
              kr.rencana_tl,
              kr.data_dukung_url,
              kr.data_dukung_nama,
              kr.diisi_oleh,
              kr.updated_at AS realisasi_updated_at,
              CASE
                WHEN COALESCE(
                       CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                            THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                  WHERE krc.indikator_id = ki.id
                                    AND krc.tahun = ${tahun}
                                    AND krc.bulan <= ${bulan})
                            ELSE kr.realisasi END,
                       kr.realisasi
                     ) IS NULL OR kt.target IS NULL OR kt.target = 0
                  THEN NULL
                WHEN ki.bermakna_negatif = TRUE
                  THEN ROUND(
                    (kt.target::NUMERIC - (
                      COALESCE(
                        CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                             THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                   WHERE krc.indikator_id = ki.id
                                     AND krc.tahun = ${tahun}
                                     AND krc.bulan <= ${bulan})::NUMERIC
                             ELSE kr.realisasi::NUMERIC END,
                        kr.realisasi::NUMERIC
                      ) - kt.target::NUMERIC
                    ))
                    / kt.target::NUMERIC * 100, 2
                  )
                ELSE
                  ROUND(
                    COALESCE(
                      CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                           THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                 WHERE krc.indikator_id = ki.id
                                   AND krc.tahun = ${tahun}
                                   AND krc.bulan <= ${bulan})::NUMERIC
                           ELSE kr.realisasi::NUMERIC END,
                      kr.realisasi::NUMERIC
                    ) / kt.target::NUMERIC * 100, 2
                  )
              END AS capaian_persen
            FROM kinerja_indikator ki
            LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
            LEFT JOIN kinerja_realisasi kr
              ON kr.indikator_id = ki.id
             AND kr.bulan  = ${bulan}
             AND kr.tahun  = ${tahun}
            LEFT JOIN kinerja_target kt
              ON kt.indikator_id = ki.id
             AND kt.tahun        = ${tahun}
            WHERE ki.aktif = TRUE
              AND ki.jenis_spm = TRUE
              AND ki.penanggung_jawab = ${bidangNama}
            ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC
          `
        : auth.is_admin
          ? await sql`
            SELECT
              ki.id,
              ki.group_id,
              kg.nama       AS group_nama,
              kg.jenis      AS group_jenis,
              kg.urutan     AS group_urutan,
              ki.sasaran,
              ki.indikator_kinerja,
              ki.satuan,
              kt.target        AS target_tahun,
              kt.target_display AS target_display,
              ki.penanggung_jawab,
              ki.bermakna_negatif,
              ki.urutan,
              ki.jenis_monev,
              ki.jenis_ikk,
              ki.jenis_spm,
              ki.formula,
              kr.id         AS realisasi_id,
              kr.realisasi,
              kr.realisasi_display,
              kr.f_penghambat,
              kr.solusi,
              kr.f_pendukung,
              kr.rencana_tl,
              kr.data_dukung_url,
              kr.data_dukung_nama,
              kr.diisi_oleh,
              kr.updated_at AS realisasi_updated_at,
              CASE
                WHEN COALESCE(
                       CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                            THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                  WHERE krc.indikator_id = ki.id
                                    AND krc.tahun = ${tahun}
                                    AND krc.bulan <= ${bulan})
                            ELSE kr.realisasi END,
                       kr.realisasi
                     ) IS NULL OR kt.target IS NULL OR kt.target = 0
                  THEN NULL
                WHEN ki.bermakna_negatif = TRUE
                  THEN ROUND(
                    (kt.target::NUMERIC - (
                      COALESCE(
                        CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                             THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                   WHERE krc.indikator_id = ki.id
                                     AND krc.tahun = ${tahun}
                                     AND krc.bulan <= ${bulan})::NUMERIC
                             ELSE kr.realisasi::NUMERIC END,
                        kr.realisasi::NUMERIC
                      ) - kt.target::NUMERIC
                    ))
                    / kt.target::NUMERIC * 100, 2
                  )
                ELSE
                  ROUND(
                    COALESCE(
                      CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                           THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                 WHERE krc.indikator_id = ki.id
                                   AND krc.tahun = ${tahun}
                                   AND krc.bulan <= ${bulan})::NUMERIC
                           ELSE kr.realisasi::NUMERIC END,
                      kr.realisasi::NUMERIC
                    ) / kt.target::NUMERIC * 100, 2
                  )
              END AS capaian_persen
            FROM kinerja_indikator ki
            LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
            LEFT JOIN kinerja_realisasi kr
              ON kr.indikator_id = ki.id
             AND kr.bulan  = ${bulan}
             AND kr.tahun  = ${tahun}
            LEFT JOIN kinerja_target kt
              ON kt.indikator_id = ki.id
             AND kt.tahun        = ${tahun}
            WHERE ki.aktif = TRUE
              AND ki.jenis_monev = TRUE
            ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC
          `
          : userIndikatorIds !== null
          ? await sql`
            SELECT
              ki.id,
              ki.group_id,
              kg.nama       AS group_nama,
              kg.jenis      AS group_jenis,
              kg.urutan     AS group_urutan,
              ki.sasaran,
              ki.indikator_kinerja,
              ki.satuan,
              kt.target        AS target_tahun,
              kt.target_display AS target_display,
              ki.penanggung_jawab,
              ki.bermakna_negatif,
              ki.urutan,
              ki.jenis_monev,
              ki.jenis_ikk,
              ki.jenis_spm,
              ki.formula,
              kr.id         AS realisasi_id,
              kr.realisasi,
              kr.realisasi_display,
              kr.f_penghambat,
              kr.solusi,
              kr.f_pendukung,
              kr.rencana_tl,
              kr.data_dukung_url,
              kr.data_dukung_nama,
              kr.diisi_oleh,
              kr.updated_at AS realisasi_updated_at,
              CASE
                WHEN COALESCE(
                       CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                            THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                  WHERE krc.indikator_id = ki.id
                                    AND krc.tahun = ${tahun}
                                    AND krc.bulan <= ${bulan})
                            ELSE kr.realisasi END,
                       kr.realisasi
                     ) IS NULL OR kt.target IS NULL OR kt.target = 0
                  THEN NULL
                WHEN ki.bermakna_negatif = TRUE
                  THEN ROUND(
                    (kt.target::NUMERIC - (
                      COALESCE(
                        CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                             THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                   WHERE krc.indikator_id = ki.id
                                     AND krc.tahun = ${tahun}
                                     AND krc.bulan <= ${bulan})::NUMERIC
                             ELSE kr.realisasi::NUMERIC END,
                        kr.realisasi::NUMERIC
                      ) - kt.target::NUMERIC
                    ))
                    / kt.target::NUMERIC * 100, 2
                  )
                ELSE
                  ROUND(
                    COALESCE(
                      CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                           THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                 WHERE krc.indikator_id = ki.id
                                   AND krc.tahun = ${tahun}
                                   AND krc.bulan <= ${bulan})::NUMERIC
                           ELSE kr.realisasi::NUMERIC END,
                      kr.realisasi::NUMERIC
                    ) / kt.target::NUMERIC * 100, 2
                  )
              END AS capaian_persen
            FROM kinerja_indikator ki
            LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
            LEFT JOIN kinerja_realisasi kr
              ON kr.indikator_id = ki.id
             AND kr.bulan  = ${bulan}
             AND kr.tahun  = ${tahun}
            LEFT JOIN kinerja_target kt
              ON kt.indikator_id = ki.id
             AND kt.tahun        = ${tahun}
            WHERE ki.aktif = TRUE
              AND ki.jenis_monev = TRUE
              AND ki.id = ANY(${userIndikatorIds !== null ? userIndikatorIds : [-1]})
            ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC
          `
          : await sql`
            SELECT
              ki.id,
              ki.group_id,
              kg.nama       AS group_nama,
              kg.jenis      AS group_jenis,
              kg.urutan     AS group_urutan,
              ki.sasaran,
              ki.indikator_kinerja,
              ki.satuan,
              kt.target        AS target_tahun,
              kt.target_display AS target_display,
              ki.penanggung_jawab,
              ki.bermakna_negatif,
              ki.urutan,
              ki.jenis_monev,
              ki.jenis_ikk,
              ki.jenis_spm,
              ki.formula,
              kr.id         AS realisasi_id,
              kr.realisasi,
              kr.realisasi_display,
              kr.f_penghambat,
              kr.solusi,
              kr.f_pendukung,
              kr.rencana_tl,
              kr.data_dukung_url,
              kr.data_dukung_nama,
              kr.diisi_oleh,
              kr.updated_at AS realisasi_updated_at,
              CASE
                WHEN COALESCE(
                       CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                            THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                  WHERE krc.indikator_id = ki.id
                                    AND krc.tahun = ${tahun}
                                    AND krc.bulan <= ${bulan})
                            ELSE kr.realisasi END,
                       kr.realisasi
                     ) IS NULL OR kt.target IS NULL OR kt.target = 0
                  THEN NULL
                WHEN ki.bermakna_negatif = TRUE
                  THEN ROUND(
                    (kt.target::NUMERIC - (
                      COALESCE(
                        CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                             THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                   WHERE krc.indikator_id = ki.id
                                     AND krc.tahun = ${tahun}
                                     AND krc.bulan <= ${bulan})::NUMERIC
                             ELSE kr.realisasi::NUMERIC END,
                        kr.realisasi::NUMERIC
                      ) - kt.target::NUMERIC
                    ))
                    / kt.target::NUMERIC * 100, 2
                  )
                ELSE
                  ROUND(
                    COALESCE(
                      CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                           THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                 WHERE krc.indikator_id = ki.id
                                   AND krc.tahun = ${tahun}
                                   AND krc.bulan <= ${bulan})::NUMERIC
                           ELSE kr.realisasi::NUMERIC END,
                      kr.realisasi::NUMERIC
                    ) / kt.target::NUMERIC * 100, 2
                  )
              END AS capaian_persen
            FROM kinerja_indikator ki
            LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
            LEFT JOIN kinerja_realisasi kr
              ON kr.indikator_id = ki.id
             AND kr.bulan  = ${bulan}
             AND kr.tahun  = ${tahun}
            LEFT JOIN kinerja_target kt
              ON kt.indikator_id = ki.id
             AND kt.tahun        = ${tahun}
            WHERE ki.aktif = TRUE
              AND ki.jenis_monev = TRUE
            ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC
          `;
      return jsonResponse({ rekap: rows.map(normTarget), bulan, tahun });
    } catch (err) {
      console.error('[GET kinerja/rekap]', err);
      return errorResponse('Gagal mengambil rekap: ' + err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATS — untuk dashboard stat card Kinerja
  // GET /api/kinerja/stats?bulan=1&tahun=2026
  // ─────────────────────────────────────────────────────────────────────────────
  if (sub === 'stats') {
    const auth = requireAuth(event);
    if (!auth) return errorResponse('Unauthorized', 401);

    const bulan = parseInt(qs.bulan || new Date().getMonth() + 1);
    const tahun = parseInt(qs.tahun || new Date().getFullYear());

    try {
      let rows;

      let belumRows;
      if (auth.is_admin) {
        // Admin: hitung semua indikator aktif
        rows = await sql`
          SELECT
            COUNT(ki.id)::int                                        AS total_indikator,
            COUNT(kr.realisasi)::int                                 AS sudah_diisi,
            (COUNT(ki.id) - COUNT(kr.realisasi))::int                AS belum_diisi
          FROM kinerja_indikator ki
          LEFT JOIN kinerja_realisasi kr
            ON kr.indikator_id = ki.id
           AND kr.bulan  = ${bulan}
           AND kr.tahun  = ${tahun}
           AND kr.realisasi IS NOT NULL
          WHERE ki.aktif = TRUE
        `;
        belumRows = await sql`
          SELECT ki.id, ki.indikator_kinerja AS nama, kg.nama AS bidang,
                 ki.jenis_monev, ki.jenis_ikk, ki.jenis_spm, ki.bermakna_negatif
          FROM kinerja_indikator ki
          LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
          LEFT JOIN kinerja_realisasi kr
            ON kr.indikator_id = ki.id
           AND kr.bulan  = ${bulan}
           AND kr.tahun  = ${tahun}
           AND kr.realisasi IS NOT NULL
          WHERE ki.aktif = TRUE AND kr.realisasi IS NULL
          ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC
          LIMIT 200
        `;
      } else {
        // User biasa: hitung hanya indikator yang di-assign ke user
        const assignRows = await sql`
          SELECT indikator_id FROM user_indikator WHERE user_id = ${auth.id}
        `;
        if (assignRows.length === 0) {
          return jsonResponse({ total_indikator: 0, sudah_diisi: 0, belum_diisi: 0, belum_isi_list: [], no_assignment: true });
        }
        const ids = assignRows.map(r => r.indikator_id);

        rows = await sql`
          SELECT
            COUNT(ki.id)::int                                        AS total_indikator,
            COUNT(kr.realisasi)::int                                 AS sudah_diisi,
            (COUNT(ki.id) - COUNT(kr.realisasi))::int                AS belum_diisi
          FROM kinerja_indikator ki
          LEFT JOIN kinerja_realisasi kr
            ON kr.indikator_id = ki.id
           AND kr.bulan  = ${bulan}
           AND kr.tahun  = ${tahun}
           AND kr.realisasi IS NOT NULL
          WHERE ki.aktif = TRUE
            AND ki.id = ANY(${ids})
        `;
        belumRows = await sql`
          SELECT ki.id, ki.indikator_kinerja AS nama, kg.nama AS bidang,
                 ki.jenis_monev, ki.jenis_ikk, ki.jenis_spm, ki.bermakna_negatif
          FROM kinerja_indikator ki
          LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
          LEFT JOIN kinerja_realisasi kr
            ON kr.indikator_id = ki.id
           AND kr.bulan  = ${bulan}
           AND kr.tahun  = ${tahun}
           AND kr.realisasi IS NOT NULL
          WHERE ki.aktif = TRUE AND ki.id = ANY(${ids}) AND kr.realisasi IS NULL
          ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC
          LIMIT 200
        `;
      }

      const s = rows[0];
      return jsonResponse({
        total_indikator: s.total_indikator,
        sudah_diisi:     s.sudah_diisi,
        belum_diisi:     s.belum_diisi,
        belum_isi_list:  belumRows,
      });
    } catch (err) {
      console.error('[GET kinerja/stats]', err);
      return errorResponse('Gagal mengambil stats kinerja: ' + err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MONITORING — Admin only
  // GET /api/kinerja/monitoring?bulan=5&tahun=2026&jenis=monev
  // ─────────────────────────────────────────────────────────────────────────────
  if (sub === 'monitoring') {
    const admin = requireAdmin(event);
    if (!admin) return errorResponse('Unauthorized — admin only', 401);

    const bulan = qs.bulan ? parseInt(qs.bulan) : null;   // null = semua bulan
    const tahun = qs.tahun ? parseInt(qs.tahun) : null;   // null = semua tahun
    const jenis = qs.jenis || 'all'; // 'monev' | 'ikk' | 'spm' | 'all'

    // Helper: kondisi JOIN realisasi sesuai filter bulan/tahun
    // Kalau semua bulan → join tanpa filter bulan/tahun (ambil semua realisasi)
    // Kalau ada bulan/tahun → join dengan filter spesifik
    // Karena template literal SQL tidak bisa conditional, kita buat 4 kombinasi query

    try {
      // neon tagged template tidak bisa interpolasi sql`...` fragment di posisi ON clause
      // maupun di akhir WHERE → pakai 4 query eksplisit, filter jenis pakai boolean biasa
      const filterMonev = jenis === 'monev';
      const filterIkk   = jenis === 'ikk';
      const filterSpm   = jenis === 'spm';

      let rows;

      if (bulan != null && tahun != null) {
        rows = await sql`
          SELECT
            ki.id AS indikator_id, ki.indikator_kinerja, ki.satuan,
            kt.target AS target_tahun, kt.target_display AS target_display, ki.penanggung_jawab,
            COALESCE(
              (SELECT ARRAY_AGG(u2.nama ORDER BY u2.nama)
               FROM user_indikator uik2
               JOIN users u2 ON u2.id = uik2.user_id
               WHERE uik2.indikator_id = ki.id
              ), '{}'
            ) AS pic_users,
            ki.bermakna_negatif, ki.jenis_monev, ki.jenis_ikk, ki.jenis_spm, ki.urutan,
            kg.nama AS group_nama, kg.jenis AS group_jenis, kg.urutan AS group_urutan,
            kr.id AS realisasi_id, kr.bulan, kr.tahun AS realisasi_tahun,
            kr.realisasi, kr.realisasi_display, kr.f_penghambat, kr.solusi, kr.f_pendukung, kr.rencana_tl,
            kr.updated_at AS diisi_pada,
            u.id AS user_id, u.nama AS user_nama, u.email AS user_email,
            b.nama AS user_bidang, b.singkatan AS user_bidang_singkatan,
            CASE WHEN kr.realisasi IS NOT NULL THEN 'terisi' ELSE 'belum' END AS status,
            CASE
              WHEN COALESCE(
                     CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                          THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                WHERE krc.indikator_id = ki.id
                                  AND krc.tahun = ${tahun}
                                  AND krc.bulan <= ${bulan})
                          ELSE kr.realisasi END,
                     kr.realisasi
                   ) IS NULL OR kt.target IS NULL OR kt.target = 0 THEN NULL
              WHEN ki.bermakna_negatif = TRUE
                THEN ROUND((kt.target::NUMERIC - (COALESCE(CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%' THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc WHERE krc.indikator_id = ki.id AND krc.tahun = ${tahun} AND krc.bulan <= ${bulan})::NUMERIC ELSE kr.realisasi::NUMERIC END, kr.realisasi::NUMERIC) - kt.target::NUMERIC)) / kt.target::NUMERIC * 100, 2)
              ELSE ROUND(COALESCE(CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%' THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc WHERE krc.indikator_id = ki.id AND krc.tahun = ${tahun} AND krc.bulan <= ${bulan})::NUMERIC ELSE kr.realisasi::NUMERIC END, kr.realisasi::NUMERIC) / kt.target::NUMERIC * 100, 2)
            END AS capaian_persen
          FROM kinerja_indikator ki
          LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
          LEFT JOIN kinerja_realisasi kr ON kr.indikator_id = ki.id AND kr.bulan = ${bulan} AND kr.tahun = ${tahun}
          LEFT JOIN kinerja_target kt ON kt.indikator_id = ki.id AND kt.tahun = ${tahun}
          LEFT JOIN users u ON u.id = kr.diisi_oleh
          LEFT JOIN bidang b ON b.id = u.bidang_id
          WHERE ki.aktif = TRUE
            AND (NOT ${filterMonev} OR ki.jenis_monev = TRUE)
            AND (NOT ${filterIkk}   OR ki.jenis_ikk   = TRUE)
            AND (NOT ${filterSpm}   OR ki.jenis_spm   = TRUE)
          ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC,
                   kr.tahun ASC NULLS LAST, kr.bulan ASC NULLS LAST
        `;
      } else if (bulan != null) {
        rows = await sql`
          SELECT
            ki.id AS indikator_id, ki.indikator_kinerja, ki.satuan,
            kt.target AS target_tahun, kt.target_display AS target_display, ki.penanggung_jawab,
            COALESCE(
              (SELECT ARRAY_AGG(u2.nama ORDER BY u2.nama)
               FROM user_indikator uik2
               JOIN users u2 ON u2.id = uik2.user_id
               WHERE uik2.indikator_id = ki.id
              ), '{}'
            ) AS pic_users,
            ki.bermakna_negatif, ki.jenis_monev, ki.jenis_ikk, ki.jenis_spm, ki.urutan,
            kg.nama AS group_nama, kg.jenis AS group_jenis, kg.urutan AS group_urutan,
            kr.id AS realisasi_id, kr.bulan, kr.tahun AS realisasi_tahun,
            kr.realisasi, kr.realisasi_display, kr.f_penghambat, kr.solusi, kr.f_pendukung, kr.rencana_tl,
            kr.updated_at AS diisi_pada,
            u.id AS user_id, u.nama AS user_nama, u.email AS user_email,
            b.nama AS user_bidang, b.singkatan AS user_bidang_singkatan,
            CASE WHEN kr.realisasi IS NOT NULL THEN 'terisi' ELSE 'belum' END AS status,
            CASE
              WHEN COALESCE(
                     CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%'
                          THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc
                                WHERE krc.indikator_id = ki.id
                                  AND krc.tahun = ${tahun}
                                  AND krc.bulan <= ${bulan})
                          ELSE kr.realisasi END,
                     kr.realisasi
                   ) IS NULL OR kt.target IS NULL OR kt.target = 0 THEN NULL
              WHEN ki.bermakna_negatif = TRUE
                THEN ROUND((kt.target::NUMERIC - (COALESCE(CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%' THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc WHERE krc.indikator_id = ki.id AND krc.tahun = ${tahun} AND krc.bulan <= ${bulan})::NUMERIC ELSE kr.realisasi::NUMERIC END, kr.realisasi::NUMERIC) - kt.target::NUMERIC)) / kt.target::NUMERIC * 100, 2)
              ELSE ROUND(COALESCE(CASE WHEN ki.indikator_kinerja ILIKE 'Jumlah%' THEN (SELECT SUM(krc.realisasi) FROM kinerja_realisasi krc WHERE krc.indikator_id = ki.id AND krc.tahun = ${tahun} AND krc.bulan <= ${bulan})::NUMERIC ELSE kr.realisasi::NUMERIC END, kr.realisasi::NUMERIC) / kt.target::NUMERIC * 100, 2)
            END AS capaian_persen
          FROM kinerja_indikator ki
          LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
          LEFT JOIN kinerja_realisasi kr ON kr.indikator_id = ki.id AND kr.bulan = ${bulan}
          LEFT JOIN kinerja_target kt ON kt.indikator_id = ki.id
          LEFT JOIN users u ON u.id = kr.diisi_oleh
          LEFT JOIN bidang b ON b.id = u.bidang_id
          WHERE ki.aktif = TRUE
            AND (NOT ${filterMonev} OR ki.jenis_monev = TRUE)
            AND (NOT ${filterIkk}   OR ki.jenis_ikk   = TRUE)
            AND (NOT ${filterSpm}   OR ki.jenis_spm   = TRUE)
          ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC,
                   kr.tahun ASC NULLS LAST, kr.bulan ASC NULLS LAST
        `;
      } else if (tahun != null) {
        rows = await sql`
          SELECT
            ki.id AS indikator_id, ki.indikator_kinerja, ki.satuan,
            kt.target AS target_tahun, kt.target_display AS target_display, ki.penanggung_jawab,
            COALESCE(
              (SELECT ARRAY_AGG(u2.nama ORDER BY u2.nama)
               FROM user_indikator uik2
               JOIN users u2 ON u2.id = uik2.user_id
               WHERE uik2.indikator_id = ki.id
              ), '{}'
            ) AS pic_users,
            ki.bermakna_negatif, ki.jenis_monev, ki.jenis_ikk, ki.jenis_spm, ki.urutan,
            kg.nama AS group_nama, kg.jenis AS group_jenis, kg.urutan AS group_urutan,
            kr.id AS realisasi_id, kr.bulan, kr.tahun AS realisasi_tahun,
            kr.realisasi, kr.realisasi_display, kr.f_penghambat, kr.solusi, kr.f_pendukung, kr.rencana_tl,
            kr.updated_at AS diisi_pada,
            u.id AS user_id, u.nama AS user_nama, u.email AS user_email,
            b.nama AS user_bidang, b.singkatan AS user_bidang_singkatan,
            CASE WHEN kr.realisasi IS NOT NULL THEN 'terisi' ELSE 'belum' END AS status,
            CASE
              WHEN kr.realisasi IS NULL OR kt.target IS NULL OR kt.target = 0 THEN NULL
              WHEN ki.bermakna_negatif = TRUE
                THEN ROUND((kt.target::NUMERIC - (kr.realisasi::NUMERIC - kt.target::NUMERIC)) / kt.target::NUMERIC * 100, 2)
              ELSE ROUND(kr.realisasi::NUMERIC / kt.target::NUMERIC * 100, 2)
            END AS capaian_persen
          FROM kinerja_indikator ki
          LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
          LEFT JOIN kinerja_realisasi kr ON kr.indikator_id = ki.id AND kr.tahun = ${tahun}
          LEFT JOIN kinerja_target kt ON kt.indikator_id = ki.id AND kt.tahun = ${tahun}
          LEFT JOIN users u ON u.id = kr.diisi_oleh
          LEFT JOIN bidang b ON b.id = u.bidang_id
          WHERE ki.aktif = TRUE
            AND (NOT ${filterMonev} OR ki.jenis_monev = TRUE)
            AND (NOT ${filterIkk}   OR ki.jenis_ikk   = TRUE)
            AND (NOT ${filterSpm}   OR ki.jenis_spm   = TRUE)
          ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC,
                   kr.tahun ASC NULLS LAST, kr.bulan ASC NULLS LAST
        `;
      } else {
        rows = await sql`
          SELECT
            ki.id AS indikator_id, ki.indikator_kinerja, ki.satuan,
            kt.target AS target_tahun, kt.target_display AS target_display, ki.penanggung_jawab,
            COALESCE(
              (SELECT ARRAY_AGG(u2.nama ORDER BY u2.nama)
               FROM user_indikator uik2
               JOIN users u2 ON u2.id = uik2.user_id
               WHERE uik2.indikator_id = ki.id
              ), '{}'
            ) AS pic_users,
            ki.bermakna_negatif, ki.jenis_monev, ki.jenis_ikk, ki.jenis_spm, ki.urutan,
            kg.nama AS group_nama, kg.jenis AS group_jenis, kg.urutan AS group_urutan,
            kr.id AS realisasi_id, kr.bulan, kr.tahun AS realisasi_tahun,
            kr.realisasi, kr.realisasi_display, kr.f_penghambat, kr.solusi, kr.f_pendukung, kr.rencana_tl,
            kr.updated_at AS diisi_pada,
            u.id AS user_id, u.nama AS user_nama, u.email AS user_email,
            b.nama AS user_bidang, b.singkatan AS user_bidang_singkatan,
            CASE WHEN kr.realisasi IS NOT NULL THEN 'terisi' ELSE 'belum' END AS status,
            CASE
              WHEN kr.realisasi IS NULL OR kt.target IS NULL OR kt.target = 0 THEN NULL
              WHEN ki.bermakna_negatif = TRUE
                THEN ROUND((kt.target::NUMERIC - (kr.realisasi::NUMERIC - kt.target::NUMERIC)) / kt.target::NUMERIC * 100, 2)
              ELSE ROUND(kr.realisasi::NUMERIC / kt.target::NUMERIC * 100, 2)
            END AS capaian_persen
          FROM kinerja_indikator ki
          LEFT JOIN kinerja_group kg ON kg.id = ki.group_id
          LEFT JOIN kinerja_realisasi kr ON kr.indikator_id = ki.id
          LEFT JOIN kinerja_target kt ON kt.indikator_id = ki.id
          LEFT JOIN users u ON u.id = kr.diisi_oleh
          LEFT JOIN bidang b ON b.id = u.bidang_id
          WHERE ki.aktif = TRUE
            AND (NOT ${filterMonev} OR ki.jenis_monev = TRUE)
            AND (NOT ${filterIkk}   OR ki.jenis_ikk   = TRUE)
            AND (NOT ${filterSpm}   OR ki.jenis_spm   = TRUE)
          ORDER BY kg.urutan ASC NULLS LAST, ki.urutan ASC, ki.id ASC,
                   kr.tahun ASC NULLS LAST, kr.bulan ASC NULLS LAST
        `;
      }

      const total  = rows.length;
      const terisi = rows.filter(r => r.status === 'terisi').length;
      const belum  = total - terisi;

      const pjMap = {};
      for (const r of rows) {
        const pj = r.penanggung_jawab || '— Tanpa PJ —';
        if (!pjMap[pj]) pjMap[pj] = { penanggung_jawab: pj, total: 0, terisi: 0, belum: 0 };
        pjMap[pj].total++;
        if (r.status === 'terisi') pjMap[pj].terisi++;
        else pjMap[pj].belum++;
      }
      const summary_pj = Object.values(pjMap).sort((a, b) => b.belum - a.belum);

      return jsonResponse({
        bulan: bulan ?? null,
        tahun: tahun ?? null,
        jenis,
        summary: { total, terisi, belum },
        summary_pj,
        indikator: rows.map(normTarget),
      });
    } catch (err) {
      console.error('[GET kinerja/monitoring]', err);
      return errorResponse('Gagal mengambil data monitoring: ' + err.message);
    }
  }

  // ══════════════════════════════════════════════════════
  //  LAPORAN TEMPLATE  (Admin only)
  // ══════════════════════════════════════════════════════
  if (sub === 'laporan-template') {
    const adminUser = requireAdmin(event);
    if (!adminUser) return errorResponse('Unauthorized', 401);

    // Pastikan tabel ada — tanpa FK dulu agar tidak error jika tabel belum ada
    try {
      await sql`CREATE TABLE IF NOT EXISTS laporan_template (
        id SERIAL PRIMARY KEY, jenis TEXT NOT NULL DEFAULT 'urusan',
        nama TEXT NOT NULL, urutan INT NOT NULL DEFAULT 0,
        parent_id INT REFERENCES laporan_template(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW())`;
      await sql`CREATE TABLE IF NOT EXISTS laporan_template_indikator (
        id SERIAL PRIMARY KEY, template_id INT NOT NULL,
        indikator_id INT NOT NULL, urutan INT NOT NULL DEFAULT 0,
        UNIQUE(template_id, indikator_id))`;
      // Migrasi: tambah kolom parent_id jika tabel sudah dibuat sebelumnya tanpa kolom ini
      await sql`ALTER TABLE laporan_template ADD COLUMN IF NOT EXISTS parent_id INT REFERENCES laporan_template(id) ON DELETE CASCADE`;
    } catch(_e) { /* tabel sudah ada, lanjut */ }

    const templateId = segments[1] ? parseInt(segments[1]) : null;
    const subAction  = segments[2] || null; // 'indikator'

    // ── GET /api/kinerja/laporan-template/:id/indikator ──
    if (event.httpMethod === 'GET' && templateId && subAction === 'indikator') {
      try {
        const rows = await sql`
          SELECT ki.id, ki.indikator_kinerja, ki.satuan, ki.jenis_monev, ki.jenis_ikk, ki.jenis_spm,
                 lti.urutan
          FROM laporan_template_indikator lti
          JOIN kinerja_indikator ki ON ki.id = lti.indikator_id
          WHERE lti.template_id = ${templateId}
          ORDER BY lti.urutan ASC, ki.id ASC`;
        return jsonResponse({ indikator: rows });
      } catch (err) {
        return errorResponse('Gagal: ' + err.message);
      }
    }

    // ── POST /api/kinerja/laporan-template/:id/indikator (set/replace) ──
    if (event.httpMethod === 'POST' && templateId && subAction === 'indikator') {
      try {
        const body = await parseBody(event);
        const ids  = (body.indikator_ids || []).map(Number);
        await sql`DELETE FROM laporan_template_indikator WHERE template_id = ${templateId}`;
        for (let i = 0; i < ids.length; i++) {
          await sql`INSERT INTO laporan_template_indikator (template_id, indikator_id, urutan)
                    VALUES (${templateId}, ${ids[i]}, ${i}) ON CONFLICT DO NOTHING`;
        }
        return jsonResponse({ ok: true, count: ids.length });
      } catch (err) {
        return errorResponse('Gagal: ' + err.message);
      }
    }

    // ── GET /api/kinerja/laporan-template ──
    if (event.httpMethod === 'GET' && !templateId) {
      try {
        const jenis     = event.queryStringParameters?.jenis      || null;
        const parentIdQ = event.queryStringParameters?.parent_id  || null;
        const parentIdInt = parentIdQ ? parseInt(parentIdQ) : null;
        const rows = jenis && parentIdInt
          ? await sql`
              SELECT t.*, p.nama AS parent_nama, p.jenis AS parent_jenis
              FROM laporan_template t
              LEFT JOIN laporan_template p ON p.id = t.parent_id
              WHERE t.jenis = ${jenis} AND t.parent_id = ${parentIdInt}
              ORDER BY t.urutan ASC, t.id ASC`
          : jenis
          ? await sql`
              SELECT t.*, p.nama AS parent_nama, p.jenis AS parent_jenis
              FROM laporan_template t
              LEFT JOIN laporan_template p ON p.id = t.parent_id
              WHERE t.jenis = ${jenis} ORDER BY t.urutan ASC, t.id ASC`
          : await sql`
              SELECT t.*, p.nama AS parent_nama, p.jenis AS parent_jenis
              FROM laporan_template t
              LEFT JOIN laporan_template p ON p.id = t.parent_id
              ORDER BY t.jenis ASC, t.urutan ASC, t.id ASC`;
        const counts = await sql`
          SELECT template_id, COUNT(*) as jumlah FROM laporan_template_indikator GROUP BY template_id`;
        const countMap = {};
        counts.forEach(c => { countMap[c.template_id] = parseInt(c.jumlah); });
        rows.forEach(r => { r.jumlah_indikator = countMap[r.id] || 0; });
        return jsonResponse({ templates: rows });
      } catch (err) {
        return errorResponse('Gagal: ' + err.message);
      }
    }

    // ── POST /api/kinerja/laporan-template ──
    if (event.httpMethod === 'POST' && !templateId) {
      try {
        const body = await parseBody(event);
        const { jenis, nama, urutan = 0, parent_id = null } = body;
        if (!jenis || !nama) return errorResponse('jenis dan nama wajib diisi');
        const [row] = await sql`
          INSERT INTO laporan_template (jenis, nama, urutan, parent_id)
          VALUES (${jenis}, ${nama.trim()}, ${parseInt(urutan)}, ${parent_id ? parseInt(parent_id) : null})
          RETURNING *`;
        return jsonResponse({ template: row });
      } catch (err) {
        return errorResponse('Gagal: ' + err.message);
      }
    }

    // ── PUT /api/kinerja/laporan-template/:id ──
    if (event.httpMethod === 'PUT' && templateId && !subAction) {
      try {
        const body = await parseBody(event);
        const { jenis, nama, urutan, parent_id } = body;
        const parentVal = parent_id ? parseInt(parent_id) : null;
        const [row] = await sql`
          UPDATE laporan_template SET
            jenis     = COALESCE(${jenis  ?? null}, jenis),
            nama      = COALESCE(${nama   ? nama.trim() : null}, nama),
            urutan    = COALESCE(${urutan != null ? parseInt(urutan) : null}, urutan),
            parent_id = ${parentVal}
          WHERE id = ${templateId} RETURNING *`;
        if (!row) return errorResponse('Template tidak ditemukan', 404);
        return jsonResponse({ template: row });
      } catch (err) {
        return errorResponse('Gagal: ' + err.message);
      }
    }

    // ── DELETE /api/kinerja/laporan-template/:id ──
    if (event.httpMethod === 'DELETE' && templateId && !subAction) {
      try {
        await sql`DELETE FROM laporan_template WHERE id = ${templateId}`;
        return jsonResponse({ ok: true });
      } catch (err) {
        return errorResponse('Gagal: ' + err.message);
      }
    }
  }

  return errorResponse('Not found', 404);
};