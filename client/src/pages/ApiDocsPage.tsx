import { useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import docsRaw from '../../../instruksi-api-produksi.md?raw';

// Halaman ini sudah punya judul & intro sendiri, jadi buang H1 pertama
// dari markdown supaya tidak dobel.
const DOCS_CONTENT = docsRaw.replace(/^# .*\n+/, '');

function CodeBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = ref.current?.textContent ?? '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="group relative my-3">
      <pre
        ref={ref}
        className="overflow-x-auto rounded-lg border border-hairline bg-canvas p-4 text-[13px] leading-relaxed"
      >
        {children}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 rounded-md border border-hairline bg-surface px-2 py-1 text-[11px] font-medium text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink"
      >
        {copied ? 'Tersalin' : 'Salin'}
      </button>
    </div>
  );
}

function InlineCode({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
  const isBlock = /language-/.test(className ?? '');
  if (isBlock) {
    return (
      <code className={`font-mono text-ink ${className ?? ''}`} {...props}>
        {children}
      </code>
    );
  }
  return (
    <code
      className="rounded bg-brand-tint px-1.5 py-0.5 font-mono text-[13px] text-brand"
      {...props}
    >
      {children}
    </code>
  );
}

export function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-xs font-medium tracking-wide text-brand uppercase">Dokumentasi</p>
      <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
        Instruksi API
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Panduan integrasi lengkap untuk developer maupun AI coding assistant yang menyambungkan
        aplikasi lain dengan API Wilindo — endpoint, autentikasi, dan contoh kode siap pakai.
      </p>

      <article className="mt-6 rounded-xl border border-hairline bg-surface p-6 shadow-sm sm:p-8">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h2: ({ children }) => (
              <h2 className="mt-8 mb-3 border-b border-hairline pb-2 font-display text-lg font-semibold text-ink first:mt-0">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-6 mb-2 font-display text-base font-semibold text-ink">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="mb-3 text-sm leading-relaxed text-ink/80">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="mb-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink/80">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink/80">
                {children}
              </ol>
            ),
            strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
            a: ({ children, href }) => (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-brand underline decoration-brand/30 hover:decoration-brand"
              >
                {children}
              </a>
            ),
            code: InlineCode,
            pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
            table: ({ children }) => (
              <div className="my-3 overflow-x-auto rounded-lg border border-hairline">
                <table className="w-full border-collapse text-sm">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-canvas">{children}</thead>,
            th: ({ children }) => (
              <th className="border-b border-hairline px-3 py-2 text-left font-medium text-ink">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border-b border-hairline px-3 py-2 text-ink/80 last:border-b-0">
                {children}
              </td>
            ),
            hr: () => <hr className="my-6 border-hairline" />,
          }}
        >
          {DOCS_CONTENT}
        </ReactMarkdown>
      </article>
    </div>
  );
}
