import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'

import { ApiError } from '@/api/client'
import { planTrip, type TripPlanRequest } from '@/api/trips'
import { EmptyState } from '@/components/EmptyState'
import { ErrorPanel } from '@/components/ErrorPanel'
import { ResultsSkeleton } from '@/components/ResultsSkeleton'
import { EXAMPLE_TRIP, tripFormSchema, type TripFormValues } from '@/features/trip-form/schema'
import { TripForm } from '@/features/trip-form/TripForm'
import { rememberPlaces } from '@/lib/recentPlaces'
import { defaultStartTime } from '@/lib/time'

// The results view carries the map library, which the first screen doesn't need. It's fetched
// when the user submits, so it downloads while the trip is being planned.
const loadTripResults = () => import('@/features/results/TripResults')
const TripResults = lazy(() =>
  loadTripResults().then((module) => ({ default: module.TripResults })),
)

const REQUEST_FIELD_TO_FORM_FIELD: Record<string, keyof TripFormValues> = {
  current_location: 'currentLocation',
  pickup_location: 'pickupLocation',
  dropoff_location: 'dropoffLocation',
  current_cycle_used_hours: 'cycleUsedHours',
  start_time: 'startTime',
}

function toRequest(values: TripFormValues): TripPlanRequest {
  return {
    current_location: values.currentLocation,
    pickup_location: values.pickupLocation,
    dropoff_location: values.dropoffLocation,
    current_cycle_used_hours: values.cycleUsedHours,
    start_time: values.startTime,
  }
}

export function App() {
  const form = useForm<TripFormValues>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: {
      currentLocation: '',
      pickupLocation: '',
      dropoffLocation: '',
      cycleUsedHours: 0,
      startTime: defaultStartTime(),
    },
  })

  const planMutation = useMutation({
    mutationFn: planTrip,
    onSuccess: ({ locations }) =>
      rememberPlaces([locations.current.label, locations.pickup.label, locations.dropoff.label]),
    onError: (error) => {
      if (!(error instanceof ApiError)) return
      // Surface server-side problems (e.g. a location that failed to geocode) on the field itself.
      for (const [requestField, messages] of Object.entries(error.fields)) {
        const formField = REQUEST_FIELD_TO_FORM_FIELD[requestField]
        if (formField && messages[0]) form.setError(formField, { message: messages[0] })
      }
    },
  })

  // On narrow screens the results sit below the form; bring them into view once they arrive.
  const resultsRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const results = resultsRef.current
    if (!planMutation.isSuccess || !results) return
    if (results.getBoundingClientRect().top > window.innerHeight * 0.6) {
      results.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [planMutation.isSuccess, planMutation.data])

  const submit = form.handleSubmit((values) => {
    void loadTripResults()
    planMutation.mutate(toRequest(values))
  })

  const loadExampleTrip = () => {
    form.reset({ ...EXAMPLE_TRIP, startTime: form.getValues('startTime') || defaultStartTime() })
    void submit()
  }

  return (
    <div className="min-h-screen print:bg-white">
      <header className="border-b-2 border-ink bg-sheet print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3 sm:px-6">
          <h1 className="text-lg font-bold tracking-tight">HOS Trip Planner</h1>
          <p className="text-sm text-muted">Property-carrying driver &middot; 70 hours / 8 days</p>
        </div>
      </header>

      <div className="border-b border-rule bg-sheet print:hidden">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <TripForm form={form} onSubmit={submit} isSubmitting={planMutation.isPending} />
        </div>
      </div>

      <main
        ref={resultsRef}
        aria-label="Trip plan"
        className="mx-auto max-w-7xl scroll-mt-4 px-4 pb-16 sm:px-6 print:max-w-none print:p-0"
      >
        {planMutation.isPending ? (
          <ResultsSkeleton />
        ) : planMutation.isError ? (
          <ErrorPanel
            message={
              planMutation.error instanceof ApiError
                ? planMutation.error.message
                : 'Something unexpected went wrong. Please try again.'
            }
            onRetry={submit}
          />
        ) : planMutation.isSuccess ? (
          <Suspense fallback={<ResultsSkeleton />}>
            <TripResults plan={planMutation.data} />
          </Suspense>
        ) : (
          <EmptyState onTryExample={loadExampleTrip} />
        )}
      </main>
    </div>
  )
}
