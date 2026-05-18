-- RLS untuk worksheet closing (anon) — jalankan jika submit/query gagal permission denied

ALTER TABLE business_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksheet_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksheet_in_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksheet_out_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_business_day" ON business_day;
CREATE POLICY "anon_all_business_day" ON business_day FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_worksheet_session" ON worksheet_session;
CREATE POLICY "anon_all_worksheet_session" ON worksheet_session FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_worksheet_in_line" ON worksheet_in_line;
CREATE POLICY "anon_all_worksheet_in_line" ON worksheet_in_line FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_worksheet_out_line" ON worksheet_out_line;
CREATE POLICY "anon_all_worksheet_out_line" ON worksheet_out_line FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_stock_ledger" ON stock_ledger;
CREATE POLICY "anon_all_stock_ledger" ON stock_ledger FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
