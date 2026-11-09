# Catalogue images

The catalogue image seed stores stable paths in `products.image_path` and `categories.image_path`. The JPEG files are uploaded to the public `catalogue` Storage bucket by the uploader; rerunning it replaces objects at those same paths.

1. Keep one generated three-photo sheet per product under `assets/catalogue/sheets/product-gallery/<product-slug>.png`, then run `python3 scripts/build-catalogue-images.py` to crop the three distinct photos, retain the existing cover, and recreate `catalogue-images.sql`.
2. For a local database, run `supabase db reset`; it seeds the catalogue and image paths in order. For a hosted database, first run `catalogue.sql` in the SQL editor.
3. Set `SUPABASE_SERVICE_ROLE_KEY` in your shell. The uploader reads `EXPO_PUBLIC_SUPABASE_URL` from `.env` (or `SUPABASE_URL`) and the service role key from the environment. For local Storage, set both values to the local credentials shown by `supabase status`.
4. Run `node scripts/upload-catalogue-images.mjs`. For a hosted database, then run `catalogue-images.sql` in the SQL editor.

The image path seed is safe to rerun. It updates catalogue cover and gallery paths and leaves descriptions, units, and prices alone. Each gallery photo is cropped from a different scene in that product's generated triptych.
