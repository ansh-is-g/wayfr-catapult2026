import { SimulatorWorkspace } from "@/components/SimulatorWorkspace"

export default async function SimulatorPage({
  params,
}: {
  params: Promise<{ homeId: string }>
}) {
  const { homeId } = await params

  return (
    <main className="shell">
      <div className="page-frame">
        <SimulatorWorkspace homeId={homeId} />
      </div>
    </main>
  )
}
