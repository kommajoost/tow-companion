import type { Army, ArmyUnit, UnitProfile } from '../types';

// Parses an "Old World Builder" army-list export into a structured Army.
// The export looks like:
//
//   ===
//   Dark Elves allround [1000 pts]
//   Warhammer: The Old World, Dark Elves, Open War
//   ===
//
//   ++ Characters [290 pts] ++
//
//   Supreme Sorceress [185 pts]
//   - Hand weapon
//   - Wizard [Level 3 Wizard]
//   Special Rules: Elven Reflexes, Eternal Hatred, …
//
//   [Supreme Sorceress] M(5) WS(4) BS(4) S(3) T(3) W(3) I(5) A(2) Ld(8)
//   [Dark Pegasus] M(8) WS(3) BS(-) S(4) T(-) W((+1)) I(4) A(3) Ld(-)
//
// It is line-based and tolerant of blank lines and minor spacing differences.

const POINTS_RE = /\[\s*(\d+)\s*(?:pts|points)?\s*\]/i;
const CATEGORY_RE = /^\+\+\s*(.+?)\s*\+\+$/;
const PROFILE_RE = /^\[(.+?)\]\s*(.*)$/;
// stat cells like  M(5)  WS(4)  W((+1))  Ld(-)  — value is everything up to the ")" that
// is followed by whitespace or end-of-line, so nested parens like "(+1)" are kept whole.
const STAT_RE = /([A-Za-z]+)\((.*?)\)(?=\s|$)/g;

const stripPoints = (s: string) => s.replace(POINTS_RE, '').trim();
const pointsOf = (s: string): number | null => {
  const m = s.match(POINTS_RE);
  return m ? parseInt(m[1], 10) : null;
};

export function parseArmyList(text: string): Army {
  const raw = text ?? '';
  const lines = raw.split(/\r?\n/);

  let name = 'Army';
  let points: number | null = null;
  let system = '';
  let faction = '';
  let composition = '';

  // Header: the block between the first pair of === fences (or the first two
  // non-empty lines if no fences are present).
  const fenceIdx: number[] = [];
  lines.forEach((l, i) => {
    if (/^={2,}\s*$/.test(l.trim())) fenceIdx.push(i);
  });
  let headerLines: string[];
  if (fenceIdx.length >= 2) {
    headerLines = lines.slice(fenceIdx[0] + 1, fenceIdx[1]).filter((l) => l.trim());
  } else {
    headerLines = lines.filter((l) => l.trim()).slice(0, 2);
  }
  if (headerLines[0]) {
    name = stripPoints(headerLines[0]) || 'Army';
    points = pointsOf(headerLines[0]);
  }
  if (headerLines[1]) {
    const parts = headerLines[1].split(',').map((p) => p.trim());
    system = parts[0] || '';
    faction = parts[1] || '';
    composition = parts.slice(2).join(', ');
  }

  // Body starts after the header block.
  const bodyStart = fenceIdx.length >= 2 ? fenceIdx[1] + 1 : 0;

  const units: ArmyUnit[] = [];
  let category = '';
  let current: ArmyUnit | null = null;
  let inFooter = false;

  const pushCurrent = () => {
    if (current) units.push(current);
    current = null;
  };

  for (let i = bodyStart; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;
    if (/^-{3,}\s*$/.test(line)) {
      // footer divider ("--- Created with …")
      inFooter = true;
      pushCurrent();
      continue;
    }
    if (inFooter) continue;

    // category header
    const cat = line.match(CATEGORY_RE);
    if (cat) {
      pushCurrent();
      category = stripPoints(cat[1]).trim();
      continue;
    }

    // profile line  [Label] M(..) …  → attach to the current unit
    const prof = line.match(PROFILE_RE);
    if (prof) {
      const profile: UnitProfile = { label: prof[1].trim(), stats: [] };
      let m: RegExpExecArray | null;
      STAT_RE.lastIndex = 0;
      while ((m = STAT_RE.exec(prof[2]))) {
        profile.stats.push({ k: m[1], v: m[2] });
      }
      if (current) current.profiles.push(profile);
      continue;
    }

    // option line
    if (line.startsWith('-')) {
      if (current) current.options.push(line.replace(/^-\s*/, '').trim());
      continue;
    }

    // special rules line
    if (/^special rules\s*:/i.test(line)) {
      const list = line.replace(/^special rules\s*:/i, '');
      const rules = list
        .split(',')
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      if (current) current.specialRules.push(...rules);
      continue;
    }

    // otherwise: a new unit line (has points, or is a plain titled line under a category)
    if (POINTS_RE.test(line) || category) {
      pushCurrent();
      let rest = stripPoints(line);
      let count: number | null = null;
      const cm = rest.match(/^(\d+)\s+(.*)$/);
      if (cm) {
        count = parseInt(cm[1], 10);
        rest = cm[2].trim();
      }
      current = {
        id: String(units.length),
        name: rest || 'Unit',
        count,
        points: pointsOf(line),
        category,
        options: [],
        specialRules: [],
        profiles: [],
      };
      continue;
    }
  }
  pushCurrent();

  return { name, points, system, faction, composition, units, raw };
}

/** Distinct special-rule labels across the whole army, in first-seen order. */
export function armySpecialRules(army: Army | null | undefined): string[] {
  if (!army) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of army.units) {
    for (const r of u.specialRules) {
      const key = r.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(r);
      }
    }
  }
  return out;
}
