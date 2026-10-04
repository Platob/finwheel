import { THEMES } from '../../../shared/constants';
import type { ThemeId } from '../../../shared/schema';
import { casino } from './casino';
import { glam } from './glam';
import type { WheelTheme } from './types';

export type { WheelTheme } from './types';

const THEME_MAP: Record<ThemeId, WheelTheme> = { glam, casino };

export const getTheme = (id: ThemeId): WheelTheme => THEME_MAP[id];

/** Validates a theme name from the URL (`?theme=casino`). */
export function parseTheme(value: string | null): ThemeId | null {
  return (THEMES as readonly string[]).includes(value ?? '') ? (value as ThemeId) : null;
}
