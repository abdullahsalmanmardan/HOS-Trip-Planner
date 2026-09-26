import { z } from 'zod'

export const MAX_CYCLE_HOURS = 70

const location = z.string().trim().min(3, 'Enter a city or address.')

export const tripFormSchema = z
  .object({
    currentLocation: location,
    pickupLocation: location,
    dropoffLocation: location,
    cycleUsedHours: z
      .number({ error: 'Enter the hours you have used, from 0 to 70.' })
      .min(0, 'Cannot be negative.')
      .max(MAX_CYCLE_HOURS, `Cannot be more than ${MAX_CYCLE_HOURS} hours.`),
    startTime: z.string().min(1, 'Choose when the trip starts.'),
  })
  .refine(
    (values) => values.pickupLocation.toLowerCase() !== values.dropoffLocation.toLowerCase(),
    { message: 'Dropoff must be different from pickup.', path: ['dropoffLocation'] },
  )

export type TripFormValues = z.infer<typeof tripFormSchema>

export const EXAMPLE_TRIP: Omit<TripFormValues, 'startTime'> = {
  currentLocation: 'Chicago, IL',
  pickupLocation: 'Indianapolis, IN',
  dropoffLocation: 'Denver, CO',
  cycleUsedHours: 20,
}
