-- Enforce outstock quantity and required notes at database level (tamper-resistant).

CREATE OR REPLACE FUNCTION assert_worksheet_out_line_stock_and_note()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_stock NUMERIC(14, 4);
BEGIN
  IF NEW.quantity > 0 THEN
    IF BTRIM(COALESCE(NEW.note, '')) = '' THEN
      RAISE EXCEPTION
        'Keterangan / Alasan Outstock wajib diisi ketika quantity > 0'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT i.current_stock
    INTO v_current_stock
    FROM ingredient i
    WHERE i.id = NEW.ingredient_id;

    IF v_current_stock IS NULL THEN
      RAISE EXCEPTION 'Ingredient tidak ditemukan untuk outstock'
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.quantity > v_current_stock THEN
      RAISE EXCEPTION
        'Logical Fallacy: Jumlah pengeluaran barang mustahil melebihi persediaan yang ada.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS worksheet_out_line_stock_and_note ON worksheet_out_line;

CREATE TRIGGER worksheet_out_line_stock_and_note
  BEFORE INSERT OR UPDATE ON worksheet_out_line
  FOR EACH ROW
  EXECUTE FUNCTION assert_worksheet_out_line_stock_and_note();

COMMENT ON FUNCTION assert_worksheet_out_line_stock_and_note IS
  'Blocks outstock rows that exceed ingredient.current_stock or omit required notes.';
