'use client';

import { memo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Ported verbatim from Content Studio's MolarChat.jsx — recognizes the
// same (EXP)/(SOON) text markers a host's grounded facts responses may
// emit, styling them consistently regardless of which app is hosting.
function getText(node: ReactNode): string {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getText).join('');
  if (
    node &&
    typeof node === 'object' &&
    'props' in node &&
    (node as { props?: { children?: ReactNode } }).props?.children
  ) {
    return getText((node as { props: { children: ReactNode } }).props.children);
  }
  return '';
}

interface MolarMarkdownProps {
  text: string;
  isUser: boolean;
}

/** Internal — not exported publicly. Message-bubble markdown renderer,
 *  ported verbatim from Content Studio's MemoizedMessage/chatComponents. */
export const MolarMarkdown = memo(function MolarMarkdown({ text, isUser }: MolarMarkdownProps) {
  const components = {
    strong: ({ children, ...props }: { children?: ReactNode }) => {
      const content = getText(children);
      const isExpired = content.includes('(EXP)');
      const isSoon = content.includes('(SOON)');
      const cls = isExpired
        ? 'molar-chat-md-strong molar-chat-md-strong--expired'
        : isSoon
          ? 'molar-chat-md-strong molar-chat-md-strong--soon'
          : `molar-chat-md-strong ${isUser ? 'molar-chat-md-strong--user' : 'molar-chat-md-strong--model'}`;
      return (
        <strong className={cls} {...props}>
          {children}
        </strong>
      );
    },
    table: ({ children, ...props }: { children?: ReactNode }) => (
      <div className="molar-chat-md-table-wrap">
        <div className="molar-chat-md-table-scroll">
          <table className="molar-chat-md-table" {...props}>
            {children}
          </table>
        </div>
      </div>
    ),
    thead: ({ children, ...props }: { children?: ReactNode }) => (
      <thead className="molar-chat-md-thead" {...props}>
        {children}
      </thead>
    ),
    th: ({ children, ...props }: { children?: ReactNode }) => (
      <th className="molar-chat-md-th" {...props}>
        {children}
      </th>
    ),
    tr: ({ children, ...props }: { children?: ReactNode }) => (
      <tr className="molar-chat-md-tr" {...props}>
        {children}
      </tr>
    ),
    td: ({ children, ...props }: { children?: ReactNode }) => {
      const content = getText(children);
      const isExpired = content.includes('(EXP)');
      const isSoon = content.includes('(SOON)');
      const cls = isExpired
        ? 'molar-chat-md-td molar-chat-md-td--expired'
        : isSoon
          ? 'molar-chat-md-td molar-chat-md-td--soon'
          : `molar-chat-md-td ${isUser ? 'molar-chat-md-td--user' : 'molar-chat-md-td--model'}`;
      return (
        <td className={cls} {...props}>
          {children}
        </td>
      );
    },
    p: ({ children, ...props }: { children?: ReactNode }) => (
      <p className={`molar-chat-md-p ${isUser ? 'molar-chat-md-p--user' : 'molar-chat-md-p--model'}`} {...props}>
        {children}
      </p>
    ),
    ul: ({ children, ...props }: { children?: ReactNode }) => (
      <ul className={`molar-chat-md-ul ${isUser ? 'molar-chat-md-ul--user' : 'molar-chat-md-ul--model'}`} {...props}>
        {children}
      </ul>
    ),
    li: ({ children, ...props }: { children?: ReactNode }) => (
      <li className={`molar-chat-md-li ${isUser ? 'molar-chat-md-li--user' : 'molar-chat-md-li--model'}`} {...props}>
        {children}
      </li>
    ),
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </ReactMarkdown>
  );
});
