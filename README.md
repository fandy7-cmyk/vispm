# SPM Verifikasi Puskesmas

Aplikasi web Verifikasi Indeks SPM Puskesmas — dibangun untuk Netlify + Neon PostgreSQL.

## Stack
- **Frontend**: Vanilla HTML/CSS/JS (SPA)
- **Backend**: Netlify Functions (Node.js serverless)
- **Database**: Neon PostgreSQL

## Cara Deploy ke Netlify

### 1. Upload ke GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/USERNAME/spm-app.git
git push -u origin main
```

### 2. Connect ke Netlify
1. Login ke [netlify.com](https://netlify.com)
2. Klik **Add new site → Import an existing project**
3. Pilih repository GitHub kamu
4. Build settings otomatis terdeteksi dari `netlify.toml`
5. Klik **Deploy site**

### 3. Set Environment Variables di Netlify
1. Masuk ke **Site Settings → Environment Variables**
2. Tambahkan:
   ```
   DATABASE_URL = postgresql://neondb_owner:npg_4v9ecCiljanE@ep-dry-shape-a1v0rcx8-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
3. **Deploy ulang** site setelah menambahkan env var

### 4. Isi Data Awal Database
Jalankan query berikut di Neon SQL Editor untuk menambahkan admin awal:

```sql
-- Tambah admin pertama
INSERT INTO users (email, nama, role, aktif)
VALUES ('admin@email.com', 'Administrator', 'Admin', true);

-- Contoh puskesmas
INSERT INTO master_puskesmas (kode_pkm, nama_puskesmas, indeks_beban_kerja, aktif)
VALUES ('PKM01', 'Puskesmas Contoh', 1.5, true);

-- Contoh indikator
INSERT INTO master_indikator (no_indikator, nama_indikator, bobot, aktif) VALUES
(1, 'Pelayanan Kesehatan Ibu Hamil', 10, true),
(2, 'Pelayanan Kesehatan Ibu Bersalin', 10, true),
(3, 'Pelayanan Kesehatan Bayi Baru Lahir', 10, true);

-- Aktifkan periode input
INSERT INTO periode_input (tahun, bulan, nama_bulan, tanggal_mulai, tanggal_selesai, status)
VALUES (2026, 2, 'Februari', '2026-02-01', '2026-02-28', 'Aktif');
```

## Struktur Roles
| Role | Akses |
|------|-------|
| **Admin** | Dashboard, Verifikasi Final, Laporan, Kelola User/PKM/Indikator/Periode |
| **Operator** | Input Usulan, Laporan sendiri |
| **Kapus** | Verifikasi Tahap 1, Laporan PKM sendiri |
| **Pengelola Program** | Verifikasi Tahap 2 (per indikator), Laporan |
| **Kadis** | Dashboard read-only, Laporan semua PKM |

## Alur Verifikasi
```
Operator → Submit → Kapus → Setujui → Pengelola Program → Setujui → Admin → Setujui → SELESAI
```

## Lokal Development
```bash
npm install
# Install Netlify CLI
npm install -g netlify-cli
# Buat file .env dari .env.example
cp .env.example .env
# Edit .env dengan DATABASE_URL yang benar
netlify dev
```
