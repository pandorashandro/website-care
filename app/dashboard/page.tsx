export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Your Websites</h1>
          <p className="mt-1 text-sm text-gray-500">
            Keep track of the websites you manage and monitor their health in one place.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add Website
        </button>
      </div>

      <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
        <h2 className="text-sm font-medium text-gray-900">No websites yet</h2>
        <p className="mt-1 max-w-sm text-sm text-gray-500">
          You haven&apos;t added any websites yet. Once you add one, it will show up here.
        </p>
      </div>
    </div>
  )
}
