-- Photo columns keep backward compatibility with the old single-photo storage.
-- Multiple uploaded photos are stored as semicolon-separated Cloudinary values.

COMMENT ON COLUMN worksheet_out_line.photo_url IS
  'Cloudinary secure URLs for out stock evidence photos; multiple values are separated by semicolon.';

COMMENT ON COLUMN worksheet_out_line.photo_public_id IS
  'Cloudinary public_ids for out stock evidence photos; multiple values are separated by semicolon in the same order as photo_url.';

COMMENT ON COLUMN worksheet_menu_issue_line.photo_url IS
  'Cloudinary secure URLs for remake/menu issue evidence photos; multiple values are separated by semicolon.';

COMMENT ON COLUMN worksheet_menu_issue_line.photo_public_id IS
  'Cloudinary public_ids for remake/menu issue evidence photos; multiple values are separated by semicolon in the same order as photo_url.';
