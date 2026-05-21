-- Out stock evidence photo and optional note.

ALTER TABLE worksheet_out_line
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS photo_public_id TEXT;

CREATE INDEX IF NOT EXISTS worksheet_out_line_photo_idx
  ON worksheet_out_line (photo_public_id)
  WHERE photo_public_id IS NOT NULL;

CREATE OR REPLACE FUNCTION assert_worksheet_out_line_stock_and_note()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_stock NUMERIC(14, 4);
BEGIN
  IF NEW.quantity > 0 THEN
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

COMMENT ON COLUMN worksheet_out_line.photo_url IS
  'Cloudinary secure URL for optional out stock evidence photo.';

COMMENT ON COLUMN worksheet_out_line.photo_public_id IS
  'Cloudinary public_id for optional out stock evidence photo.';
