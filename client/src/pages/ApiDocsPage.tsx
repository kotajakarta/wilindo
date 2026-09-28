import { useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import docsRaw from '../../../instruksi-api-produksi.md?raw';
import apiSpecJson from '../data/wilindo-api-spec.json';

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
  const [copiedAiJson, setCopiedAiJson] = useState(false);
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  async function handleCopyAiJson() {
    await navigator.clipboard.writeText(JSON.stringify(apiSpecJson, null, 2));
    setCopiedAiJson(true);
    window.setTimeout(() => setCopiedAiJson(false), 2000);
  }

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

      {/* Banner & Tombol Copy Format JSON untuk AI Coding Agent */}
      <div className="mt-6 rounded-xl border border-brand/20 bg-gradient-to-r from-brand-tint/60 to-surface p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-xs">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-sm font-semibold text-ink">
                  AI Coding Agent Format (JSON)
                </h3>
                <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                  Prompt-Ready
                </span>
              </div>
              <p className="mt-1 text-xs text-muted max-w-xl">
                Salin seluruh spesifikasi dan instruksi API ini dalam format JSON terstruktur untuk
                diberikan ke AI coding assistant (Cursor, GitHub Copilot, Claude Code, ChatGPT, dll).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              id="btn-copy-ai-json"
              onClick={handleCopyAiJson}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold shadow-xs transition-all cursor-pointer ${
                copiedAiJson
                  ? 'bg-success text-white'
                  : 'bg-brand text-white hover:bg-brand-dark'
              }`}
            >
              {copiedAiJson ? (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Tersalin ke Clipboard!</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                    />
                  </svg>
                  <span>Salin JSON untuk AI</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowJsonPreview(!showJsonPreview)}
              className="rounded-lg border border-hairline bg-surface px-3 py-2 text-xs font-medium text-muted hover:text-ink hover:bg-canvas transition-colors cursor-pointer"
            >
              {showJsonPreview ? 'Tutup Preview' : 'Lihat JSON'}
            </button>
          </div>
        </div>

        {/* Expandable JSON Preview */}
        {showJsonPreview && (
          <div className="mt-4 rounded-lg border border-hairline bg-ink p-4 font-mono text-xs text-canvas max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center pb-2 mb-2 border-b border-white/10 text-[11px] text-faint">
              <span>wilindo-api-spec.json</span>
              <button
                type="button"
                onClick={handleCopyAiJson}
                className="hover:text-white underline cursor-pointer"
              >
                {copiedAiJson ? 'Tersalin!' : 'Salin Semua'}
              </button>
            </div>
            <pre className="overflow-x-auto leading-relaxed">{JSON.stringify(apiSpecJson, null, 2)}</pre>
          </div>
        )}
      </div>

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
