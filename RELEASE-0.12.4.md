# 0.12.4

Fixes the floating cat waking up after a reload when it was asleep in its bed.

Putting the cat to bed saved the sleeping state to the database but not to the
host app's local cache, which was only refreshed by the next network fetch. A
reload therefore started from the stale "awake" cache: the cat ran in, then fell
asleep 1-2 seconds later once the fetch returned. Every host that shows the
floating cat (Superapp, E-learning, Calculator, Inventory, Appointment, To-Do and
Content Studio) now writes the sleep state to its cache whenever it changes, and
`SharedCatMascot` starts its bed and sleeping state from the `isSleeping` value it
is given, so a sleeping cat is drawn in the bed on the first frame.

Scoped-cache hosts keep the account id in a ref so a late-arriving user id never
overwrites the cached value with a default.

No host interface changes. No database migration is required. A brand-new
browser or device with nothing cached still shows the awake cat briefly until
the first fetch returns. Publish v0.12.4 with its resource Release before
upgrading host apps.
