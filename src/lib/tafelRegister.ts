/**
 * Een klein doorgeefluik (blok E, 24-11-2026), zodat `battleByCode` (campaignBattle.ts) een Act 4-tafel kan
 * herkennen zonder dat campaignBattle.ts en tafel.ts elkaar bij het laden nodig hebben. tafel.ts meldt
 * zich hier aan; zonder aanmelding (bv. in de node-tests) is er nooit een tafel.
 */
import type { CampaignBattle } from './campaignBattle';

let maker: ((code: string) => CampaignBattle | null) | null = null;

export function zetTafelBattleMaker(fn: (code: string) => CampaignBattle | null): void {
  maker = fn;
}

export function tafelBattleVoorCode(code: string): CampaignBattle | null {
  return maker ? maker(code) : null;
}
