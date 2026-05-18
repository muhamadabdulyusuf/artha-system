# Artha Blueprint
**Abdul Company — Artha System**  
*Dokumen arsitektur v1.0 | Inventory harian Bar & Kitchen | Tanpa kode*

---

## 1. Visi & Prinsip Operasional

| Aspek | Keputusan |
|--------|-----------|
| **Scope** | 1 outlet, 2 departemen: **Bar** dan **Kitchen** |
| **Tujuan** | Cegah kebocoran modal, kurangi waste, pantau stok realtime |
| **UX** | Mobile-first, idiot-proof, input angka saja (tanpa QR, tanpa form panjang) |
| **Closing** | **Satu kali** per hari operasional (akumulasi semua shift), biasanya submit ~02:00 |
| **Business Date** | Pergantian hari pembukuan jam **05:00**. Input jam **00:00–04:59** → dicatat ke **business date = kalender − 1 hari** |
| **Bahan irisan** | Item sama (lemon, susu, dll.) = **record terpisah** per `department`; staf hanya lihat/input departemen sendiri |

---

## 2. Struktur Entitas Data

### 2.1 Diagram Relasi (ringkas)

```
outlet (1)
  ├── staff ──► role (admin | op_manager | bar_staff | kitchen_staff)
  ├── ingredient (department: bar | kitchen) ──► unit
  ├── menu_item (department) ──► menu_recipe_version ──► recipe_line ──► ingredient
  └── business_day (business_date, status)
        ├── stock_ledger (per ingredient, per business_date)
        ├── worksheet_session (bar | kitchen, state machine)
        │     ├── worksheet_in_line (ingredient_id, qty_in)
        │     └── worksheet_sold_line (menu_item_id, qty_sold)  ← hanya di "Daftar Menu Jadi"
        └── closing_adjustment (admin, setelah submit)
```

### 2.2 Tabel Inti

| Entitas | Field kunci | Catatan |
|---------|-------------|---------|
| **outlet** | `id`, `name` | MVP: satu record |
| **staff** | `id`, `name`, `pin_hash`, `role`, `department?`, `is_active` | `department` wajib untuk bar/kitchen staff; null untuk admin/op_manager |
| **ingredient** | `id`, `name`, `department`, `unit`, `is_active` | Lemon Bar ≠ Lemon Kitchen (ID unik) |
| **menu_item** | `id`, `name`, `department`, `is_active` | Menu jadi (jual ke tamu) |
| **menu_recipe_version** | `id`, `menu_item_id`, `version`, `effective_from`, `is_active` | Hanya satu versi aktif per menu; historis tidak berubah |
| **recipe_line** | `recipe_version_id`, `ingredient_id`, `qty_per_portion` | Gram/ml/unit per **1 porsi** |
| **business_day** | `business_date` (DATE), `outlet_id`, `bar_status`, `kitchen_status` | Status agregat per departemen (mirror state machine) |
| **stock_ledger** | `business_date`, `ingredient_id`, `opening`, `in_total`, `theoretical_usage`, `adjustment`, `closing` | Satu baris per bahan per hari; sumber kebenaran stok |
| **worksheet_session** | `business_date`, `department`, `state`, `submitted_at`, `submitted_by`, `locked_at`, `locked_by` | Satu session per dept per business_date |
| **worksheet_in_line** | `session_id`, `ingredient_id`, `qty_in` | Hanya IN; tidak ada SOLD di baris bahan |
| **worksheet_sold_line** | `session_id`, `menu_item_id`, `qty_sold` | Angka dari POS; backend yang konversi ke bahan |
| **closing_adjustment** | `session_id`, `ingredient_id`, `qty_delta`, `reason`, `adjusted_by`, `adjusted_at` | Hanya role admin/op_manager; sebelum LOCKED |

### 2.3 Ledger Harian (bukan overwrite sembarangan)

Setiap `business_date` + `ingredient_id` menghasilkan satu **stock_ledger**:

- **opening** = `closing` hari business_date sebelumnya (auto carry-forward).
- **in_total** = Σ `worksheet_in_line.qty_in` setelah submit worksheet.
- **theoretical_usage** = Σ (qty_sold menu × qty_per_portion resep aktif pada tanggal itu).
- **adjustment** = Σ koreksi manual admin (bisa ±).
- **closing** = dihitung rumus §5; disimpan setelah submit/adjustment.

Audit: semua perubahan angka tercatat lewat session + adjustment; tidak menghapus historis versi resep lama.

---

## 3. Business Date Custom

### 3.1 Aturan

| Waktu sistem (wall clock) | Business date yang dipakai |
|---------------------------|----------------------------|
| 05:00 hari D s/d 04:59 hari D+1 | **D** (tanggal kalender hari D) |
| 00:00–04:59 hari D+1 | **D** (bukan D+1) |

**Contoh:** Staf submit closing jam **02:00 Senin** → `business_date` = **Minggu** (bukan Senin).

### 3.2 Implementasi logika (konsep)

```
function resolveBusinessDate(now):
  calendarDate = date(now)           // tanggal kalender lokal outlet
  if hour(now) < 5:
    return calendarDate - 1 day
  else:
    return calendarDate
```

- Semua API create/read worksheet, ledger, dan laporan **wajib** memakai `resolveBusinessDate()`, bukan `CURRENT_DATE` mentah.
- `submitted_at` tetap timestamp asli (audit); `business_date` yang menentukan pembukuan.

---

## 4. PIN Gate & Auto-Routing

### 4.1 Alur

```
[Buka app] → [Layar PIN 6 digit] → POST /auth/pin
  → validasi hash + is_active
  → baca role (+ department jika operasional)
  → issue session (JWT/cookie, idle timeout)
  → redirect otomatis:
```

| Role | Kamar (route) | Hak ringkas |
|------|---------------|-------------|
| **admin**, **op_manager** | Master Dashboard Admin | Semua data Bar & Kitchen; koreksi; lock closing |
| **bar_staff** | Worksheet Bar | IN bahan `department=bar`; SOLD di Daftar Menu Jadi (bar) |
| **kitchen_staff** | Worksheet Kitchen | IN bahan `department=kitchen`; SOLD menu kitchen |

### 4.2 Keamanan lapangan (MVP)

- PIN salah berulang → lockout singkat (mis. 5 menit setelah N percobaan).
- Session idle logout (mis. 30–60 menit).
- Admin dapat reset PIN staf tanpa developer.

Staf **tidak** memilih departemen atau role; server yang memutuskan dari PIN.

---

## 5. State Machine Closing

Berlaku **per departemen** (Bar dan Kitchen independen, satu `business_date`).

```
                    ┌─────────┐
                    │  DRAFT  │  Staf input IN + SOLD (menu); boleh edit
                    └────┬────┘
                         │ Submit (konfirmasi sekali)
                         ▼
                    ┌───────────┐
                    │ SUBMITTED │  Staf tidak edit; Admin boleh Adjust
                    └─────┬─────┘
                          │ Admin simpan koreksi (opsional, bisa 0..n)
                          ▼
                    ┌───────────┐
                    │ ADJUSTED  │  Ada adjustment ATAU Admin tandai "reviewed"
                    └─────┬─────┘   (boleh skip langsung ke Locked jika tanpa koreksi)
                          │ Admin Lock
                          ▼
                    ┌───────────┐
                    │  LOCKED   │  Final; tidak ada edit staf/admin
                    └───────────┘
```

| State | Staf dept | Admin / Op Manager |
|-------|-----------|---------------------|
| **DRAFT** | Edit IN & SOLD menu | Lihat semua; boleh edit? (opsional: hanya lihat) |
| **SUBMITTED** | Read-only | Koreksi manual per bahan + alasan |
| **ADJUSTED** | Read-only | Bisa tambah koreksi sampai lock |
| **LOCKED** | Read-only | Read-only; buka hari baru butuh business_date berikutnya |

**Submit** memicu: hitung `theoretical_usage`, tulis/update `stock_ledger`, set `business_day.{dept}_status`.

**Lock** memicu: carry-forward `closing` → `opening` hari berikutnya (saat business_date berikutnya dibuka).

---

## 6. Alur Worksheet (UI vs Backend)

### 6.1 Layar staf (dua zona)

1. **Daftar Bahan** (filter `department` user): kolom **IN** saja (+ tampilan sisa/readonly opsional).
2. **Daftar Menu Jadi** (bawah): kolom **SOLD** = porsi terjual dari POS; **bukan** di baris bahan baku.

### 6.2 Backend saat submit

1. Resolve `business_date` (§3).
2. Simpan `worksheet_in_line` + `worksheet_sold_line`.
3. Untiap menu terjual: ambil **recipe version aktif** pada `business_date` (`effective_from <= business_date`, `is_active`).
4. Untiap `recipe_line`: tambahkan ke `theoretical_usage` bahan terkait.
5. Hitung `closing` per bahan (§7); update `stock_ledger`.

---

## 7. Rumus Stok Akhir Harian

### 7.1 Notasi per bahan *i* pada business date *d*

| Simbol | Arti |
|--------|------|
| Oᵢ | Opening (= closingᵢ hari d−1) |
| INᵢ | Σ qty_in dari worksheet |
| Uᵢ | Theoretical usage dari konversi menu terjual |
| Aᵢ | Σ adjustment admin (positif = tambah stok, negatif = kurangi) |
| Cᵢ | Closing |

### 7.2 Konversi resep → pemakaian teoritis

Untuk setiap baris penjualan menu *m* dengan `qty_sold = Sₘ`:

```
Uᵢ += Σₘ ( Sₘ × recipe_line(i, m, version@d) )
```

`recipe_line(i, m, v)` = `qty_per_portion` bahan *i* dalam resep menu *m* versi *v*.

Hanya menu dengan `department` sama dengan worksheet yang di-submit (Bar worksheet tidak memotong bahan Kitchen kecuali resep cross-dept — **MVP: tidak**, menu hanya memotong bahan dept sendiri).

### 7.3 Closing

```
Cᵢ = Oᵢ + INᵢ − Uᵢ + Aᵢ
```

- Sebelum submit: preview opsional `Cᵢ_preview` tanpa Aᵢ.
- Setelah submit: `Uᵢ` final; `Aᵢ = 0` kecuali admin adjust.
- Setelah adjust: `Cᵢ` dihitung ulang dengan Aᵢ terbaru.
- Setelah lock: nilai Cᵢ dibekukan.

### 7.4 Carry-forward

```
Oᵢ(d+1) = Cᵢ(d)   // d+1 = business_date berikutnya setelah lock hari d
```

---

## 8. Master Dashboard Admin (prioritas MVP)

1. **Status closing** — Bar/Kitchen: DRAFT / SUBMITTED / ADJUSTED / LOCKED per `business_date` aktif.
2. **Variance ringkas** — bahan dengan selisih besar (mis. |adjustment| atau teoritis vs ekspektasi).
3. **Menu vs bahan kritis** — menu terlaris & bahan mendekati habis (closing rendah).

CRUD MVP: staf+PIN, bahan, menu, resep (versi baru), reset PIN. Multi-outlet & integrasi POS otomatis: **fase 2**.

---

## 9. Stack & Repo (langkah berikutnya — di luar dokumen ini)

Setelah blueprint disetujui: init repository, pilih stack (disarankan: API + DB relational + PWA mobile-first), migrasi schema sesuai §2, implement `resolveBusinessDate()` di core, lalu PIN gate → worksheet → ledger → admin lock.

---

*Dokumen ini mengunci keputusan alignment Bos: department terpisah, single closing, business date 05:00, adjustment sebelum lock, ledger + resep berversi.*
