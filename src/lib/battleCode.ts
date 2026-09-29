/**
 * Twee soorten codes lopen door de Game-tab (29-09-2026):
 *   - een CAMPAGNE-battle heeft een sync-code van ZES hex-tekens (towc_battle_leger: md5-substring);
 *   - een VRIJ potje (New battle > Create game) krijgt VIER tekens uit CODE_ALPHABET (game.tsx).
 * Het "Battle code"-veld op het startscherm kende alleen de eerste; wie er een vrije-potje-code in
 * typte kreeg "Could not load this battle". Eén helper, zodat startscherm en battle-paneel hetzelfde
 * onderscheid maken.
 */
export const isVrijPotjeCode = (code: string): boolean => /^[A-Z2-9]{4}$/i.test(code.trim());
