import { Logo } from "../ui";

export const metadata = { title: "HoldOn · Stage" };

/** Split screen for the demo video: Mom's tablet on the left, Priya's phone on the right. */
export default function Stage() {
  return (
    <main className="flex h-dvh flex-col bg-[#ece5d8] p-4">
      <header className="mb-3 flex items-center justify-between px-2">
        <Logo />
        <span className="text-sm text-muted">The family wallet that thinks twice</span>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[1.35fr_1fr]">
        <figure className="flex min-h-0 flex-col">
          <figcaption className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted">Sunita&apos;s tablet · Mom Mode</figcaption>
          <iframe src="/mom?embed=1" title="Mom Mode" className="min-h-0 flex-1 rounded-[28px] border-[10px] border-ink bg-paper shadow-xl" />
        </figure>
        <figure className="flex min-h-0 flex-col">
          <figcaption className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted">Priya&apos;s phone · family group</figcaption>
          <iframe src="/family?embed=1&as=mem_priya" title="Family chat" className="mx-auto min-h-0 w-full max-w-[420px] flex-1 rounded-[36px] border-[10px] border-ink bg-paper shadow-xl" />
        </figure>
      </div>
    </main>
  );
}
