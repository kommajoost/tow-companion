import { type ReactNode } from 'react';
import type { RichNode } from '../types';
import { useUI } from '../state';
import { useData } from '../data';

// Renders a Contentful rich-text document verbatim. Inline links to other rules
// (`entry-hyperlink`) become tappable terms that open the rule in a pop-up sheet.

const HEADING_TAG: Record<string, keyof React.JSX.IntrinsicElements> = {
  'heading-1': 'h2',
  'heading-2': 'h2',
  'heading-3': 'h3',
  'heading-4': 'h4',
  'heading-5': 'h5',
  'heading-6': 'h6',
};

function applyMarks(value: string, marks?: { type: string }[]): ReactNode {
  let node: ReactNode = value;
  if (!marks) return node;
  for (const m of marks) {
    switch (m.type) {
      case 'bold':
        node = <strong>{node}</strong>;
        break;
      case 'italic':
        node = <em>{node}</em>;
        break;
      case 'underline':
        node = <u>{node}</u>;
        break;
      case 'code':
        node = <code>{node}</code>;
        break;
      case 'superscript':
        node = <sup>{node}</sup>;
        break;
      case 'subscript':
        node = <sub>{node}</sub>;
        break;
      default:
        break;
    }
  }
  return node;
}

function RuleTerm({ slug, children }: { slug: string; children: ReactNode }) {
  const { openRule } = useUI();
  return (
    <span
      role="button"
      tabIndex={0}
      className="rule-term"
      onClick={(e) => {
        e.stopPropagation();
        openRule(slug);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openRule(slug);
        }
      }}
    >
      {children}
    </span>
  );
}

// A chart (e.g. the Miscast Table) embedded inline as a table.
function ChartBlock({ slug, name }: { slug: string; name?: string }) {
  const { getRule } = useData();
  const rule = getRule(slug);
  if (!rule?.body) return <BlockEntry slug={slug} name={name ?? slug} />;
  const title = (name ?? rule.name ?? '').replace(/\s*\(chart\)\s*$/i, '');
  return (
    <figure className="my-4 rounded-xl border border-border bg-surface-2 p-3">
      {title && (
        <figcaption className="mb-2 font-display text-sm uppercase tracking-wide text-gold">
          {title}
        </figcaption>
      )}
      <Node node={rule.body} />
    </figure>
  );
}

// A non-chart entry embedded as a block → a tappable card that opens the pop-up.
function BlockEntry({ slug, name }: { slug: string; name: string }) {
  const { openRule } = useUI();
  return (
    <button
      onClick={() => openRule(slug)}
      className="my-3 flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left text-accent active:bg-surface-3"
    >
      <span className="min-w-0 truncate">{name}</span>
      <span className="shrink-0 text-ink-faint">›</span>
    </button>
  );
}

function renderChildren(nodes: RichNode[] | undefined): ReactNode {
  if (!nodes) return null;
  return nodes.map((n, i) => <Node key={i} node={n} />);
}

function Node({ node }: { node: RichNode }): ReactNode {
  switch (node.nodeType) {
    case 'document':
      return <>{renderChildren(node.content)}</>;

    case 'paragraph':
      return <p>{renderChildren(node.content)}</p>;

    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
    case 'heading-4':
    case 'heading-5':
    case 'heading-6': {
      const Tag = HEADING_TAG[node.nodeType];
      return <Tag>{renderChildren(node.content)}</Tag>;
    }

    case 'unordered-list':
      return <ul>{renderChildren(node.content)}</ul>;
    case 'ordered-list':
      return <ol>{renderChildren(node.content)}</ol>;
    case 'list-item':
      return <li>{renderChildren(node.content)}</li>;

    case 'blockquote':
      return <blockquote>{renderChildren(node.content)}</blockquote>;

    case 'hr':
      return <hr />;

    case 'table':
      return (
        <div className="rt-table-wrap">
          <table>
            <tbody>{renderChildren(node.content)}</tbody>
          </table>
        </div>
      );
    case 'table-row':
      return <tr>{renderChildren(node.content)}</tr>;
    case 'table-header-cell':
      return <th>{renderChildren(node.content)}</th>;
    case 'table-cell':
      return <td>{renderChildren(node.content)}</td>;

    case 'text':
      return <>{applyMarks(node.value ?? '', node.marks)}</>;

    case 'hyperlink':
      return (
        <a
          href={node.data?.uri}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline"
        >
          {renderChildren(node.content)}
        </a>
      );

    case 'entry-hyperlink':
    case 'embedded-entry-inline': {
      const slug = node.data?.target?.fields?.slug;
      const name = node.data?.target?.fields?.name;
      const label = renderChildren(node.content);
      const hasLabel = Array.isArray(label) && label.length > 0;
      if (slug) return <RuleTerm slug={slug}>{hasLabel ? label : name ?? slug}</RuleTerm>;
      return <>{hasLabel ? label : name}</>;
    }

    case 'embedded-entry-block': {
      const target = node.data?.target;
      const slug = target?.fields?.slug;
      const name = target?.fields?.name;
      if (!slug) return null;
      // Charts and weapon profiles are shown inline as a table, not as a tappable link.
      if (
        target?.kind === 'chart' ||
        target?.kind === 'weaponProfile' ||
        slug.endsWith('-chart') ||
        slug.endsWith('-profile')
      ) {
        return <ChartBlock slug={slug} name={name} />;
      }
      return <BlockEntry slug={slug} name={name ?? slug} />;
    }

    default:
      // Unknown node type: render any children, falling back to its text value.
      if (node.content) return <>{renderChildren(node.content)}</>;
      return <>{node.value ?? ''}</>;
  }
}

export function RichText({ doc }: { doc: RichNode | null }) {
  if (!doc) return null;
  return (
    <div className="richtext">
      <Node node={doc} />
    </div>
  );
}
