export type MountStatRow = { Name: string } & Record<string, string | undefined>;

/** Characteristic bonuses encoded by TOW mount profiles as `(+N)` / `(-N)`. */
export function mountStatModifiers(rows: MountStatRow[]): Record<string, number> {
  const modifiers: Record<string, number> = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (key === 'Name') continue;
      const match = String(value ?? '').trim().match(/^\(\s*([+-]\d+)\s*\)$/);
      if (match) modifiers[key] = (modifiers[key] ?? 0) + Number(match[1]);
    }
  }
  return modifiers;
}

/** Apply mount bonuses only to numeric rider characteristics; symbolic values stay verbatim. */
export function applyMountStatModifiers<T extends MountStatRow>(
  rows: T[],
  modifiers: Record<string, number>,
): T[] {
  if (!Object.keys(modifiers).length) return rows;
  return rows.map((row) => {
    const next: MountStatRow = { ...row };
    for (const [key, amount] of Object.entries(modifiers)) {
      const base = String(row[key] ?? '').trim();
      if (!/^\d+$/.test(base)) continue;
      next[key] = String(Number(base) + amount);
    }
    return next as T;
  });
}
