import { availablePrizes, isMoneyWheel, slotEffect, slotText } from './rules.js';
import type { Settings, Wheel } from './schema.js';
import type { WheelView } from './types.js';

/** Render-ready snapshot of a prize wheel: sold-out prizes are left out, money slices get their amount. */
export function prizeWheelView(wheel: Wheel, currency: Settings['currency']): WheelView {
  return {
    key: wheel.id,
    kind: 'prize',
    name: wheel.name,
    subtitle: wheel.subtitle,
    sizing: wheel.sizing,
    game: wheel.game,
    money: isMoneyWheel(wheel),
    segments: availablePrizes(wheel).map((p) => {
      const effect = slotEffect(p);
      return {
        id: p.id,
        label: p.label,
        description: p.description,
        weight: p.weight,
        tier: p.tier,
        ...(p.color ? { color: p.color } : {}),
        ...(p.icon ? { icon: p.icon } : {}),
        ...(p.bust ? { bust: true } : {}),
        ...slotText(p, currency),
        ...(effect ? { effect } : {}),
      };
    }),
  };
}
