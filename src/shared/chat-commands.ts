/**
 * Chat commands that start a game on one wheel ("!slots"): their format and the words they may not
 * take. Zod-free, so the config schema (server) and the dock check them exactly the same way.
 */

/** "!" then 1–24 lowercase letters, digits, "-" or "_". */
export const WHEEL_COMMAND = /^![a-z0-9_-]{1,24}$/;
export const WHEEL_COMMAND_FORMAT = 'Use "!" followed by letters, numbers, "-" or "_"';
/** The moderators' raffle command, handled by the bot whatever the settings. */
export const RAFFLE_COMMAND = '!raffle';

/** Chat matches commands without case or surrounding spaces. */
export const normalizeCommand = (text: string): string => text.trim().toLowerCase();

export interface CommandWords {
  /** Spin command of the settings ("!spin"). */
  spinCommand: string;
  /** Raffle entry keyword of the settings ("!join"). */
  raffleKeyword: string;
}

interface WheelCommand {
  name: string;
  command?: string | undefined;
}

/**
 * What is wrong with the chat command of `wheels[index]`, or null when it is fine (or unset): a bad
 * format, a word the bot already uses (spin command, raffle keyword, "!raffle") or another wheel's
 * command. Both wheels of a duplicate are reported.
 */
export function wheelCommandIssue(
  wheels: readonly WheelCommand[],
  index: number,
  words: CommandWords,
): string | null {
  const raw = wheels[index]?.command;
  if (raw === undefined) return null;
  const command = normalizeCommand(raw);
  if (!WHEEL_COMMAND.test(command)) return WHEEL_COMMAND_FORMAT;
  if (command === normalizeCommand(words.spinCommand)) return `"${command}" is already the spin command`;
  if (command === normalizeCommand(words.raffleKeyword)) return `"${command}" is already the raffle keyword`;
  if (command === RAFFLE_COMMAND) return `"${command}" is the moderators' raffle command`;
  const other = wheels.find(
    (wheel, i) => i !== index && wheel.command !== undefined && normalizeCommand(wheel.command) === command,
  );
  return other ? `"${command}" is already used by "${other.name}"` : null;
}

/** The wheel whose chat command is `word` (any case), if any. */
export function wheelForCommand<T extends WheelCommand>(wheels: readonly T[], word: string): T | undefined {
  const command = normalizeCommand(word);
  if (!command) return undefined;
  return wheels.find((wheel) => wheel.command !== undefined && normalizeCommand(wheel.command) === command);
}
