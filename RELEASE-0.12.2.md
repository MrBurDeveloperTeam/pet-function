# 0.12.2

Kart Racing now displays a desktop-required dialog on phones and tablets in
either orientation. The gate runs before engine scripts, WASM or the racing
pack load, covering both embedded and direct game URLs. Back returns to the
kart track through the existing close protocol; standalone entry returns to
the pet page. Desktop loading, retries and controls retain their existing flow.

Other games keep their current orientation gates. No database migration is
required. Publish v0.12.2 with its resource Release before upgrading host apps.
