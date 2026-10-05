/**
 * Live wheels and games for the documentation site. MkDocs loads this module (and showcase.css) on
 * every page; it fills each `.fw-live` mount point with real overlay stages played in the browser:
 *
 * - `<div class="fw-live"></div>`: every default wheel, grouped under Money wheels, Games and
 *   Prize wheels. Each card's section has the wheel id, so `/#whale` links to it.
 * - `data-wheels="broke-boi whale"`: only those wheels, in that order (no ids). Empty: no cards.
 * - `data-toolbar`: the Glam / Casino and Sound toolbar. The look is page-wide and remembered.
 * - `data-details="wheels/"`: a "Slices & odds" link on each card, to `wheels/#<wheel id>`.
 *
 * Pages without a mount point only pay for this small file: the stages, the default config and the
 * odds simulator live in a separate chunk that is fetched when there is something to show.
 */
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/inter/700.css';
import '@fontsource/lilita-one/400.css';
import './showcase.css';

const roots = [...document.querySelectorAll<HTMLElement>('.fw-live')];
if (roots.length > 0) void import('./live').then(({ mount }) => mount(roots));
