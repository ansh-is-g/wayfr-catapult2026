function PreviewPill({
  label,
  className = "",
}: {
  label: string
  className?: string
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] backdrop-blur-xl ${className}`}
    >
      {label}
    </span>
  )
}

export function DashboardPreviewSurface() {
  return (
    <main className="min-h-full bg-background">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between border-b border-border/60 pb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-mango/90">Dashboard</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Scene history</h1>
          </div>
          <PreviewPill label="manual refresh" className="border-mango/20 bg-mango/8 text-mango" />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          <section className="space-y-4">
            <div className="rounded-[1.75rem] border border-border/60 bg-card/78 p-4 shadow-none">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-tight text-foreground">Kitchen scene</h2>
                    <PreviewPill label="ready" className="border-green-500/20 bg-green-500/10 text-green-500" />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Local mesh loaded. Annotations stay outside the renderer.
                  </p>
                </div>

                <div className="flex gap-2">
                  <PreviewPill label="24 objects" className="border-border/60 bg-background/70 text-foreground" />
                  <PreviewPill label="local first" className="border-border/60 bg-background/70 text-foreground" />
                </div>
              </div>

              <div className="relative h-[28rem] overflow-hidden rounded-[1.6rem] border border-border/60 bg-[radial-gradient(circle_at_50%_30%,rgba(245,166,35,0.16),transparent_34%),linear-gradient(180deg,rgba(12,10,8,0.98),rgba(8,8,7,1))]">
                <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.3))]" />
                <div className="absolute left-14 top-16 h-36 w-52 rounded-[1.2rem] border border-white/14 bg-white/5" />
                <div className="absolute right-20 top-12 h-40 w-32 rounded-[1.2rem] border border-white/14 bg-white/6" />
                <div className="absolute bottom-12 left-24 h-20 w-72 rounded-[1.2rem] border border-mango/25 bg-mango/10" />

                <div className="absolute left-10 top-10">
                  <PreviewPill label="table" className="border-white/16 bg-black/38 text-white/88" />
                </div>
                <div className="absolute right-12 top-20">
                  <PreviewPill label="chair" className="border-white/16 bg-black/38 text-white/88" />
                </div>
                <div className="absolute bottom-10 left-36">
                  <PreviewPill label="counter" className="border-mango/24 bg-black/42 text-mango-300" />
                </div>

                <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-white/10 bg-black/42 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/70 backdrop-blur-xl">
                  182k verts · 24 annotations · orbit
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-border/60 bg-background/42 p-4 backdrop-blur-2xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-foreground">Annotations</p>
                  <p className="mt-1 text-sm text-muted-foreground">Filter outside the viewer.</p>
                </div>
                <PreviewPill label="18 visible" className="border-border/60 bg-background/70 text-foreground" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <PreviewPill label="table" className="border-mango/25 bg-mango/8 text-mango" />
                <PreviewPill label="chair" className="border-border/60 bg-background/48 text-muted-foreground" />
                <PreviewPill label="counter" className="border-mango/25 bg-mango/8 text-mango" />
                <PreviewPill label="sink" className="border-border/60 bg-background/48 text-muted-foreground" />
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[1.75rem] border border-border/60 bg-card/78 p-4 shadow-none">
              <p className="text-lg font-semibold text-foreground">Previous GLBs</p>
              <p className="mt-1 text-sm text-muted-foreground">Newest first.</p>

              <div className="mt-4 space-y-3">
                {[
                  { name: "Kitchen map", status: "ready" },
                  { name: "Living room", status: "ready" },
                  { name: "Entryway", status: "processing" },
                ].map((home) => (
                  <div
                    key={home.name}
                    className="rounded-2xl border border-border/60 bg-background/35 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{home.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">stored scene.glb</p>
                      </div>
                      <PreviewPill
                        label={home.status}
                        className={
                          home.status === "ready"
                            ? "border-green-500/20 bg-green-500/10 text-green-500"
                            : "border-mango/20 bg-mango/10 text-mango"
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}

export default DashboardPreviewSurface
