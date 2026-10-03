import { z } from 'zod';
import { CommandSchema, ConfigSchema } from '../shared/schema.js';
import type { Notice, SpinSource } from '../shared/types.js';
import { EngineError, type WheelEngine } from './engine.js';

/**
 * Validates and executes a control command coming from the dock or the HTTP API.
 * Throws `EngineError` for invalid input or commands that cannot run right now.
 */
export function runCommand(engine: WheelEngine, raw: unknown, source: SpinSource): Notice | null {
  const parsed = CommandSchema.safeParse(raw);
  if (!parsed.success) throw new EngineError(`Invalid command: ${z.prettifyError(parsed.error)}`);
  const command = parsed.data;

  switch (command.type) {
    case 'spin': {
      const outcome = engine.requestSpin({
        wheelId: command.wheelId,
        player: command.player,
        spins: command.spins,
        source,
      });
      return outcome === 'queued'
        ? { level: 'info', message: 'A spin is running — added to the queue' }
        : null;
    }
    case 'spinNext':
      engine.spinNext();
      return null;
    case 'queue.add':
      engine.enqueue({ player: command.player, wheelId: command.wheelId, spins: command.spins, source });
      return null;
    case 'queue.remove':
      engine.removeFromQueue(command.id);
      return null;
    case 'queue.clear':
      engine.clearQueue();
      return null;
    case 'wheel.select':
      engine.selectWheel(command.wheelId);
      return null;
    case 'raffle.open':
      engine.openRaffle();
      return null;
    case 'raffle.close':
      engine.closeRaffle();
      return null;
    case 'raffle.draw':
      engine.drawRaffle();
      return null;
    case 'raffle.clear':
      engine.clearRaffle();
      return null;
    case 'raffle.add':
      if (!engine.addEntrant({ login: command.name, displayName: command.name })) {
        throw new EngineError(`${command.name} is already entered`);
      }
      return null;
    case 'raffle.remove':
      engine.removeEntrant(command.login);
      return null;
    case 'overlay.show':
      engine.setVisible(true);
      return null;
    case 'overlay.hide':
      engine.setVisible(false);
      return null;
    case 'overlay.toggle':
      engine.setVisible(!engine.isVisible());
      return null;
    case 'result.dismiss':
      engine.dismissResult();
      return null;
    case 'history.clear':
      engine.clearHistory();
      return null;
    case 'config.save': {
      const current = engine.getConfig();
      const wheels = command.wheels ?? current.wheels;
      const draft = {
        ...current,
        wheels,
        settings: command.settings ?? current.settings,
        activeWheelId: wheels.some((w) => (w as { id?: unknown }).id === current.activeWheelId)
          ? current.activeWheelId
          : (wheels[0] as { id?: unknown } | undefined)?.id,
      };
      const result = ConfigSchema.safeParse(draft);
      if (!result.success) throw new EngineError(`Not saved:\n${z.prettifyError(result.error)}`);
      engine.updateConfig(result.data);
      return { level: 'success', message: 'Saved' };
    }
  }
}
