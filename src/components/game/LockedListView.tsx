import { TOW, towFont, engraved } from '../../design/tow';
import { validate, type Category, type OwbArmy, type OwbUnit, type MagicItemsData, type ListEntry } from '../../lib/owbBuilder';
import { COMPOSITION_RULES } from '../../lib/owbBuilder';

// A campaign list that has been locked for the current Act: look, don't touch.
//
// Deliberately NOT the real builder in a read-only mode. Every control in the builder mutates, so a
// read-only variant would mean auditing dozens of them and trusting that none slipped through; this
// screen simply cannot write. The escape hatch is a copy: duplicating gives a normal, unlocked list
// to experiment with, which leaves the submitted one untouched.
//
// The lock is also enforced server-side — locking snapshots the list into towc_spel_lijst, so the Act
// that was played is fixed no matter what happens here afterwards. This screen is about being clear,
// not about being the guard.

const eb = engraved as React.CSSProperties;
const ruleName = (id: string): string => COMPOSITION_RULES.find((r) => r.id === id)?.name ?? id;

interface Lijst {
  name: string; army: string; composition: string; rule: string; points: number;
  entries: ListEntry[];
}

export function LockedListView({ list, army, armyName, compName, itemsData, fase, cap, onBack, onDuplicate }: {
  list: Lijst;
  army: OwbArmy;
  armyName: string;
  compName: (comp: string) => string;
  itemsData?: MagicItemsData;
  /** The Act this list is locked for, and that Act's points cap. */
  fase: number;
  cap: number;
  onBack: () => void;
  onDuplicate: () => void;
}) {
  const getUnit = (c: Category, id: string): OwbUnit | undefined => army?.[c]?.find((u) => u.id === id);
  const v = validate(list, getUnit, itemsData);

  // Group the entries by category so the list reads like a roster rather than a flat dump.
  const cats = Array.from(new Set(list.entries.map((e) => e.cat)));

  return (
    <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '14px 14px 48px' }}>
        <button onClick={onBack} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent',
          cursor: 'pointer', padding: 0, marginBottom: 12, color: TOW.muted,
          fontFamily: towFont.display, fontWeight: 600, fontSize: 13,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
            <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          My lists
        </button>

        <div style={{
          border: `1px solid ${TOW.goldDeep}`, borderRadius: 12, padding: '12px 14px',
          background: 'rgba(138,108,48,0.06)', marginBottom: 18,
        }}>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep }}>Locked for Act {fase}</div>
          <p style={{ fontFamily: towFont.serif, fontSize: 13.5, lineHeight: 1.6, color: TOW.inkDim, margin: '7px 0 0' }}>
            This is the army you submitted. It cannot change until Act {fase + 1} opens — then you add your next 250
            points on top of it. Want to try something out in the meantime? Make a copy and play with that.
          </p>
          <button onClick={onDuplicate} style={{
            marginTop: 10, padding: '8px 14px', borderRadius: 9, cursor: 'pointer',
            border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.inkDim,
            fontFamily: towFont.display, fontWeight: 700, fontSize: 12.5,
          }}>Copy to a normal list</button>
        </div>

        <h1 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 22, color: TOW.ink, margin: '0 0 2px' }}>{list.name}</h1>
        <p style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.faint, margin: '0 0 4px' }}>
          {armyName} · {compName(list.composition)} · {ruleName(list.rule)}
        </p>
        <p style={{ fontFamily: towFont.serif, fontSize: 14, color: v.total > cap ? TOW.blood : TOW.muted, margin: '0 0 16px', fontVariantNumeric: 'tabular-nums' }}>
          {v.total} / {cap} points
        </p>

        {cats.map((cat) => {
          const rijen = list.entries.filter((e) => e.cat === cat);
          if (rijen.length === 0) return null;
          return (
            <div key={cat} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0 4px' }}>
                <span style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, whiteSpace: 'nowrap' }}>{cat}</span>
                <span style={{ flex: 1, height: 1, background: TOW.line }} />
              </div>
              {rijen.map((e, i) => {
                const u = getUnit(e.cat, e.unitId);
                return (
                  <div key={`${e.unitId}-${i}`} style={{
                    display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0',
                    borderBottom: `1px solid ${TOW.hairline}`,
                  }}>
                    <span style={{ flex: 1, minWidth: 0, fontFamily: towFont.serif, fontSize: 15, color: TOW.ink }}>
                      {/* Datasheet primair; de eigen campagne-naam eronder. Anders lees je een lijst
                          van louter eigennamen en zie je nergens welke units je hebt ingediend. */}
                      {u?.name_en || e.customName?.trim() || e.unitId}
                      {u?.name_en && e.customName?.trim() ? (
                        <span style={{ fontStyle: 'italic', color: TOW.muted }}> · {e.customName.trim()}</span>
                      ) : null}
                      {e.count > 1 && <span style={{ color: TOW.faint }}> ×{e.count}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
        {list.entries.length === 0 && (
          <p style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14, color: TOW.muted }}>This list is empty.</p>
        )}
      </div>
    </div>
  );
}
