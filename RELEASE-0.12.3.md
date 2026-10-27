# 0.12.3

The cat bed image now ships as a lossless WebP (`cat_bed_pixel.webp`) instead
of a PNG, cutting it from about 885 KB to 551 KB with identical pixels and
transparency. The image URL carries a new cache-busting version (`?v=0.9.31`)
so browsers fetch the new file. The original PNG is kept out of `public/` under
`tools/source-images/pet/`.

No behaviour, layout or host interface changes. No database migration is
required. Publish v0.12.3 with its resource Release before upgrading host apps.
