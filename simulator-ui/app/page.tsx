import { HomeList } from "@/components/HomeList"

export default function HomePage() {
  return (
    <main className="shell">
      <div className="page-frame">
        <section className="hero">
          <div className="eyebrow mono">wayfr robotics simulator demo</div>
          <h1>Train a robot inside the homes you already mapped.</h1>
          <p>
            This separate MVP turns wayfr&apos;s real 3D room scans and semantic object annotations into
            a robotics-style simulator console. Pick a home, choose a target like <span className="mono">laptop</span> or{" "}
            <span className="mono">microwave</span>, inspect the digital twin, and replay a deterministic
            training preview built on top of the real teacher path.
          </p>
        </section>

        <HomeList />
      </div>
    </main>
  )
}
