# Project screenshots

`index.html` expects these files. Any slot whose file is missing renders a
"Screenshot coming soon" placeholder instead of a broken image, so you can drop
them in one at a time.

4:3 works best (the slide box is `aspect-ratio: 4 / 3`, `object-fit: contain`).

| Project | Files |
| --- | --- |
| 01 — Coretava Loyalty Station | `loyalty-station-1.png` … `loyalty-station-4.png` |
| 02 — Coretava Admin Dashboard | `admin-dashboard-1.png` … `admin-dashboard-3.png` |
| 03 — Hunted | `hunted-1.png` … `hunted-4.png` |

Optional per-slide captions go in the matching empty
`<p class="slide-caption" data-caption></p>` element under each slideshow.
