import ReactMarkdown from "react-markdown";

// Manual element styling (no typography plugin in this repo).
export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: (p) => <h1 className="mb-3 mt-5 text-xl font-semibold tracking-tight" {...p} />,
        h2: (p) => <h2 className="mb-2 mt-5 text-lg font-semibold tracking-tight" {...p} />,
        h3: (p) => <h3 className="mb-2 mt-4 text-base font-semibold" {...p} />,
        p: (p) => <p className="mb-3 text-sm leading-relaxed text-foreground/90" {...p} />,
        ul: (p) => <ul className="mb-3 list-disc space-y-1 pl-5 text-sm" {...p} />,
        ol: (p) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm" {...p} />,
        li: (p) => <li className="leading-relaxed text-foreground/90" {...p} />,
        a: (p) => (
          <a
            className="text-primary underline underline-offset-2 hover:opacity-80"
            target="_blank"
            rel="noreferrer"
            {...p}
          />
        ),
        code: (p) => (
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs" {...p} />
        ),
        blockquote: (p) => (
          <blockquote
            className="mb-3 border-l-2 border-border pl-3 text-sm italic text-muted-foreground"
            {...p}
          />
        ),
        strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
