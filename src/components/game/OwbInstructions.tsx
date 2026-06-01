import { useState } from 'react';
import { TOW, towFont } from '../../design/tow';

// Short, collapsible "how to get your army list" helper shown next to every paste box.
// Walks the player through exporting their list from Old World Builder as plain text.
const STEPS: { text: string; em?: string }[] = [
  { text: 'Open ', em: 'old-world-builder.com' },
  { text: 'Choose your army' },
  { text: 'Tap ', em: 'Export' },
  { text: 'Under options, tick ', em: 'Show special rules' },
  { text: 'and ', em: 'Show statistics' },
  { text: 'Tap ', em: 'Copy as text' },
  { text: 'Paste it below' },
];

export function OwbInstructions({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ border: `1px solid ${TOW.line}`, borderRadius: 10, background: 'rgba(74,55,22,0.04)', margin: '8px 0 0', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '9px 12px', textAlign: 'left' }}
      >
        <span style={{ fontFamily: towFont.serif, fontSize: 13, color: TOW.goldDeep, fontWeight: 600 }}>
          How do I get my army list?
        </span>
        <span style={{ marginLeft: 'auto', color: TOW.faint, transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </button>

      {open && (
        <ol style={{ margin: 0, padding: '0 14px 12px 30px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {STEPS.map((s, i) => (
            <li key={i} style={{ fontFamily: towFont.serif, fontSize: 13, color: TOW.ink, lineHeight: 1.4 }}>
              {s.text}
              {s.em &&
                (i === 0 ? (
                  <a
                    href="https://old-world-builder.com/"
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{ color: TOW.goldDeep, fontWeight: 600, textDecoration: 'underline' }}
                  >
                    {s.em}
                  </a>
                ) : (
                  <span style={{ color: TOW.goldDeep, fontWeight: 600 }}>“{s.em}”</span>
                ))}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
