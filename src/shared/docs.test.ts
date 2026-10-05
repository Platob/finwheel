import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isMoneyWheel, slotText } from './rules.js';
import { ConfigSchema, type Prize, type Wheel } from './schema.js';

/** Reads a file of the repository, wherever the tests run from. */
const repoFile = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const config = ConfigSchema.parse(JSON.parse(repoFile('config/default.config.json')));
const page = repoFile('docs/wheels.md');
const lines = page.split('\n');

const isHeading = (line: string) => /^#{2,6} /.test(line);
const headings = lines.filter(isHeading);

/** Wheel ids of every live embed in `markdown` (`<div class="fw-live" data-wheels="a b">`). */
const embeds = (markdown: string) =>
  [...markdown.matchAll(/<div\b[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => /\bclass="[^"]*\bfw-live\b[^"]*"/.test(tag))
    .flatMap((tag) => /\bdata-wheels="([^"]*)"/.exec(tag)?.[1]?.split(/\s+/).filter(Boolean) ?? []);
const embedded = embeds(page);

/** Paragraphs (blank-line separated, lines joined) of the section headed `{ #id }`, up to the next heading. */
function sectionParagraphs(id: string): string[] {
  const start = lines.findIndex((line) => isHeading(line) && line.endsWith(`{ #${id} }`));
  if (start < 0) return [];
  const end = lines.findIndex((line, i) => i > start && isHeading(line));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim());
}

/** The slices a section lists in order ("On the wheel, clockwise: $2 · $10 …" or "Bins, left to right: …"). */
function listedSlices(id: string): string[] | undefined {
  const line = sectionParagraphs(id).find((p) => /^(On the wheel, clockwise|Bins, left to right)\b/.test(p));
  return line?.slice(line.indexOf(': ') + 2).split(' · ');
}

/** What a slice prints, written as the page writes it: "$1 BONUS SPIN", "×2 TOTAL", "Bankrupt". */
function printed(prize: Prize): string {
  const text = slotText(prize, config.settings.currency);
  return text ? [text.amount, text.caption.toUpperCase()].filter(Boolean).join(' ') : prize.label;
}

/** Wheels whose order matters on screen and the page lists: wheels and plinko boards that pay money. */
const listsSlices = (wheel: Wheel) =>
  (wheel.game === 'wheel' || wheel.game === 'plinko') && isMoneyWheel(wheel);

// Guards docs/wheels.md against going stale again when the default wheels change.
describe('docs/wheels.md', () => {
  it.each(config.wheels.map((wheel) => [wheel.id, wheel] as const))('documents the %s wheel', (id, wheel) => {
    // A section per wheel, anchored on its id: the live cards' "Slices & odds" links go to wheels/#<id>.
    const heading = headings.find((line) => line.endsWith(`{ #${id} }`));
    expect(heading, `a heading ending in "{ #${id} }"`).toBeDefined();
    expect(heading).toContain(wheel.name);
    expect(embedded, `a live embed with data-wheels containing "${id}"`).toContain(id);
    if (wheel.command) expect(page).toContain(`\`${wheel.command}\``);

    // The slices, as printed and in config order (clockwise on a wheel, left to right on a board).
    const listed = listedSlices(id);
    if (listsSlices(wheel)) expect(listed, `the ${id} section lists its slices in order`).toBeDefined();
    if (listed) expect(listed).toEqual(wheel.prizes.map(printed));
  });
});

describe('docs pages', () => {
  it('embed only default wheels', () => {
    const ids = new Set(config.wheels.map((wheel) => wheel.id));
    const unknown = readdirSync(new URL('../../docs/', import.meta.url))
      .filter((file) => file.endsWith('.md'))
      .flatMap((file) => embeds(repoFile(`docs/${file}`)).map((id) => `${file}: ${id}`))
      .filter((entry) => !ids.has(entry.slice(entry.indexOf(': ') + 2)));
    expect(unknown).toEqual([]);
  });
});
