import type { ReactNode } from 'react'
import { Controller, type UseFormReturn } from 'react-hook-form'

import { Field, inputClassName, primaryButtonClassName } from '@/components/Field'

import { LocationInput } from './LocationInput'
import { MAX_CYCLE_HOURS, type TripFormValues } from './schema'
import { useMyLocation } from './useMyLocation'

interface TripFormProps {
  form: UseFormReturn<TripFormValues>
  onSubmit: () => void
  isSubmitting: boolean
}

interface LocationFieldProps {
  form: UseFormReturn<TripFormValues>
  name: 'currentLocation' | 'pickupLocation' | 'dropoffLocation'
  label: string
  placeholder: string
  action?: ReactNode
  hint?: string
}

function LocationField({ form, name, label, placeholder, action, hint }: LocationFieldProps) {
  const error = form.formState.errors[name]?.message
  return (
    <Field id={name} label={label} error={error} hint={hint} action={action}>
      {(describedBy) => (
        <Controller
          control={form.control}
          name={name}
          render={({ field }) => (
            <LocationInput
              id={name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              placeholder={placeholder}
              invalid={Boolean(error)}
              describedBy={describedBy}
            />
          )}
        />
      )}
    </Field>
  )
}

export function TripForm({ form, onSubmit, isSubmitting }: TripFormProps) {
  const {
    register,
    watch,
    formState: { errors },
  } = form

  const myLocation = useMyLocation((location) =>
    form.setValue('currentLocation', location, { shouldValidate: true, shouldDirty: true }),
  )
  const locateButton = myLocation.isSupported && (
    <button
      type="button"
      onClick={() => void myLocation.locate()}
      disabled={myLocation.state.status === 'locating'}
      className="text-xs font-semibold text-accent underline-offset-2 hover:underline disabled:cursor-wait disabled:text-faint"
    >
      {myLocation.state.status === 'locating' ? 'Locating...' : 'Use my location'}
    </button>
  )

  const cycleUsedHours = watch('cycleUsedHours')
  const cycleHint = Number.isFinite(cycleUsedHours)
    ? `${Math.max(0, MAX_CYCLE_HOURS - cycleUsedHours)} of 70 left`
    : 'Out of 70'

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      aria-label="Trip details"
      className="grid items-start gap-x-3 gap-y-4 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_7.5rem_14.5rem_auto]"
    >
      <LocationField
        form={form}
        name="currentLocation"
        label="Current location"
        placeholder="City, state"
        action={locateButton}
        hint={myLocation.state.status === 'error' ? myLocation.state.message : undefined}
      />
      <LocationField form={form} name="pickupLocation" label="Pickup" placeholder="City, state" />
      <LocationField form={form} name="dropoffLocation" label="Dropoff" placeholder="City, state" />

      <Field
        id="cycleUsedHours"
        label="Cycle used"
        hint={cycleHint}
        error={errors.cycleUsedHours?.message}
      >
        {(describedBy) => (
          <div className="relative">
            <input
              id="cycleUsedHours"
              type="number"
              inputMode="decimal"
              min={0}
              max={MAX_CYCLE_HOURS}
              step={0.25}
              aria-label="Cycle hours already used"
              className={`${inputClassName} pr-7 tabular-nums`}
              aria-invalid={Boolean(errors.cycleUsedHours)}
              aria-describedby={describedBy}
              {...register('cycleUsedHours', { valueAsNumber: true })}
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-faint">
              h
            </span>
          </div>
        )}
      </Field>

      <Field
        id="startTime"
        label="Departure"
        hint="Local time where you are now"
        error={errors.startTime?.message}
      >
        {(describedBy) => (
          <input
            id="startTime"
            type="datetime-local"
            step={900}
            className={`${inputClassName} tabular-nums`}
            aria-invalid={Boolean(errors.startTime)}
            aria-describedby={describedBy}
            {...register('startTime')}
          />
        )}
      </Field>

      <div className="md:col-span-3 xl:col-span-1 xl:pt-5">
        <button
          type="submit"
          disabled={isSubmitting}
          className={`${primaryButtonClassName} w-full xl:w-auto`}
        >
          {isSubmitting ? 'Planning...' : 'Plan trip'}
        </button>
      </div>
    </form>
  )
}
