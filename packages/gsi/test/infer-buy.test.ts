import { POLICY, forceBuyCash, fullBuyCash } from '@roundmind/engine';
import { describe, expect, it } from 'vitest';
import { BUY_LINES, inferChosenBuy, type RosterSample } from '../src/infer-buy.js';

function player(
  id: string,
  cash: number | undefined,
  options: { hasPrimary?: boolean; equipmentValue?: number; weaponsKnown?: boolean } = {},
): RosterSample {
  return {
    id,
    ...(cash !== undefined ? { cash } : {}),
    hasPrimary: options.hasPrimary ?? false,
    ...(options.equipmentValue !== undefined ? { equipmentValue: options.equipmentValue } : {}),
    weaponsKnown: options.weaponsKnown ?? true,
  };
}

describe('buy lines', () => {
  it('matches the economy engine categories', () => {
    expect(BUY_LINES.full.T).toBe(fullBuyCash('T'));
    expect(BUY_LINES.full.CT).toBe(fullBuyCash('CT'));
    expect(BUY_LINES.force.T).toBe(forceBuyCash('T'));
    expect(BUY_LINES.force.CT).toBe(forceBuyCash('CT'));
    expect(BUY_LINES.pistolFull).toBe(POLICY.pistolSpendLow.value);
    expect(BUY_LINES.pistolPartial).toBe(POLICY.pistolSpendHigh.value);
    expect(BUY_LINES.savePrimaryRatio).toBe(POLICY.savePrimaryRatio.value);
  });
});

describe('inferChosenBuy', () => {
  it('classifies pistol rounds with the pistol bundles, not the rifle line', () => {
    const pre = [player('a', 800), player('b', 800)];
    expect(inferChosenBuy(1, 'CT', pre, [player('a', 0), player('b', 0)])).toBe('full');
    expect(inferChosenBuy(13, 'T', [player('a', 800)], [player('a', 500)])).toBe('force');
    expect(inferChosenBuy(1, 'CT', pre, [player('a', 700), player('b', 700)])).toBe('eco');
    expect(inferChosenBuy(4, 'CT', [player('a', 800)], [player('a', 0)])).toBe('eco');
  });

  it('uses the side rifle and force lines after the pistol rounds', () => {
    expect(inferChosenBuy(4, 'CT', [player('a', 5000)], [player('a', 1100)])).toBe('full');
    expect(inferChosenBuy(4, 'T', [player('a', 5000)], [player('a', 1300)])).toBe('full');
    expect(inferChosenBuy(2, 'CT', [player('a', 3500), player('b', 2800)], [player('a', 1500), player('b', 800)])).toBe(
      'force',
    );
    expect(inferChosenBuy(4, 'T', [player('a', 1800)], [player('a', 0)])).toBe('force');
    expect(inferChosenBuy(4, 'CT', [player('a', 1800)], [player('a', 0)])).toBe('eco');
    expect(inferChosenBuy(25, 'CT', [player('a', 10400)], [player('a', 6400)])).toBe('full');
  });

  it('calls a kept primary below the force line a save', () => {
    expect(
      inferChosenBuy(3, 'CT', [player('a', 2200, { hasPrimary: true })], [player('a', 2000, { hasPrimary: true })]),
    ).toBe('save');
    const five = [0, 1, 2, 3, 4].map((index) => player(`p${index}`, 2000, { hasPrimary: index < 3 }));
    const after = five.map((entry) => ({ ...entry, cash: (entry.cash ?? 0) - 100 }));
    expect(inferChosenBuy(6, 'T', five, after)).toBe('save');
    expect(
      inferChosenBuy(6, 'CT', [player('a', 2200, { hasPrimary: true })], [player('a', 200, { hasPrimary: true })]),
    ).toBe('force');
  });

  it('does not treat a missing cash field as zero', () => {
    const missing = player('b', undefined);
    expect(inferChosenBuy(4, 'CT', [player('a', 4000), missing], [player('a', 100), missing])).toBe('full');
    expect(inferChosenBuy(4, 'CT', [player('a', 4000), missing], [player('a', 2100)])).toBe('force');
  });

  it('ignores a cash increase and falls back to equipment value', () => {
    expect(
      inferChosenBuy(
        4,
        'CT',
        [player('a', 1000, { equipmentValue: 200 })],
        [player('a', 4000, { equipmentValue: 4200 })],
      ),
    ).toBe('full');
    expect(
      inferChosenBuy(
        8,
        'T',
        [player('a', 2500, { hasPrimary: true, equipmentValue: 2700 })],
        undefined,
      ),
    ).toBe('save');
  });

  it('does not call a save when weapons were not reported', () => {
    expect(
      inferChosenBuy(
        4,
        'CT',
        [player('a', 2200, { hasPrimary: true, weaponsKnown: false })],
        [player('a', 2000, { hasPrimary: true, weaponsKnown: false })],
      ),
    ).toBe('eco');
  });
});
