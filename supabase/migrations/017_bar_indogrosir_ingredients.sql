-- BAR raw ingredients and operational supplies.
-- Idempotent: safe to run more than once; existing stock quantities are preserved.

DO $$
DECLARE
  v_serpong_fresh_id UUID;
  v_curious_people_id UUID;
BEGIN
  SELECT id
  INTO v_serpong_fresh_id
  FROM supplier
  WHERE lower(name) = lower('Serpong Fresh')
    AND is_active = TRUE
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_serpong_fresh_id IS NULL THEN
    INSERT INTO supplier (name, min_order_amount, is_active)
    VALUES ('Serpong Fresh', 0, TRUE)
    RETURNING id INTO v_serpong_fresh_id;
  END IF;

  SELECT id
  INTO v_curious_people_id
  FROM supplier
  WHERE lower(name) = lower('Curious People')
    AND is_active = TRUE
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_curious_people_id IS NULL THEN
    INSERT INTO supplier (name, min_order_amount, is_active)
    VALUES ('Curious People', 0, TRUE)
    RETURNING id INTO v_curious_people_id;
  END IF;

  INSERT INTO ingredient (
    name,
    department,
    unit,
    current_stock,
    minimum_stock,
    kind,
    is_stock_tracked,
    is_active,
    primary_supplier_id
  )
  VALUES
    ('Lime Fruit', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, v_serpong_fresh_id),
    ('Sunkist Fruit', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, v_serpong_fresh_id),
    ('Coffee Beans', 'bar', 'gr', 0, 0, 'raw', TRUE, TRUE, v_curious_people_id),
    ('Trash Bag 80x100', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Trash Bag 45x50 cm', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Plastic Take Away Box', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Plastic Take Away Cup Single', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Plastic Take Away Cup Double', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Take Away Sauce Cup', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Take Away Spoon', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Take Away Cup', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Take Away Box', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Cocktail Napkin', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Toilet Hand Towel', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Kitchen Hand Towel', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Toilet Tissue Roll', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Thermal Paper', 'bar', 'roll', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Pen', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Label', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Amplop', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Lakban', 'bar', 'pcs', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Sabun Cuci Piring', 'bar', 'ml', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Sabun Cuci Tangan', 'bar', 'ml', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Cairan Pembersih Kaca', 'bar', 'ml', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Cairan Pembersih Lantai', 'bar', 'ml', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Iceland Vodka', 'bar', 'ml', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Jose Cuervo Tequila', 'bar', 'ml', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Suntory Kakubin Whisky', 'bar', 'ml', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Tutu Concentrates Malt Zero Proof', 'bar', 'ml', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Taragui Yerba Mate', 'bar', 'gr', 0, 0, 'raw', TRUE, TRUE, NULL),
    ('Soda', 'bar', 'ml', 0, 0, 'raw', TRUE, TRUE, NULL)
  ON CONFLICT (name, department)
  DO UPDATE SET
    unit = EXCLUDED.unit,
    kind = EXCLUDED.kind,
    is_stock_tracked = EXCLUDED.is_stock_tracked,
    is_active = TRUE,
    primary_supplier_id = EXCLUDED.primary_supplier_id;
END;
$$;
