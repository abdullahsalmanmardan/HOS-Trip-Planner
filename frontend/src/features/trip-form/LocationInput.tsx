import { useQuery } from '@tanstack/react-query'
import { useId, useRef, useState, type KeyboardEvent } from 'react'

import { searchPlaces } from '@/api/trips'
import { inputClassName } from '@/components/Field'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { loadRecentPlaces } from '@/lib/recentPlaces'

const MIN_QUERY_LENGTH = 3
const DEBOUNCE_MS = 250

interface LocationInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  placeholder: string
  invalid: boolean
  describedBy?: string
}

/**
 * A searchable dropdown: focusing it lists recently used places, typing searches as you go.
 * It follows the ARIA 1.2 combobox pattern, so it works fully from the keyboard.
 */
export function LocationInput({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  invalid,
  describedBy,
}: LocationInputProps) {
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [recent, setRecent] = useState<string[]>([])

  const query = useDebouncedValue(value.trim(), DEBOUNCE_MS)
  const isSearching = query.length >= MIN_QUERY_LENGTH
  const { data: results = [], isFetching } = useQuery({
    queryKey: ['places', query],
    queryFn: ({ signal }) => searchPlaces(query, signal),
    enabled: isOpen && isSearching,
    staleTime: 5 * 60 * 1000,
  })

  const options = isSearching ? results.map((place) => place.label) : recent
  const showList = isOpen && options.length > 0
  const showNoMatches = isOpen && isSearching && !isFetching && results.length === 0
  const optionId = (index: number) => `${listboxId}-option-${index}`

  const open = () => {
    setRecent(loadRecentPlaces())
    setIsOpen(true)
  }

  const choose = (label: string) => {
    onChange(label)
    setIsOpen(false)
    setActiveIndex(-1)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && !isOpen) {
      event.preventDefault()
      open()
      return
    }
    if (!showList) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % options.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index <= 0 ? options.length - 1 : index - 1))
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      const option = options[activeIndex]
      if (option) choose(option)
    } else if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        className={`${inputClassName} pr-8`}
        value={value}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        onFocus={open}
        onChange={(event) => {
          onChange(event.target.value)
          setIsOpen(true)
          setActiveIndex(-1)
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setIsOpen(false)
          onBlur()
        }}
      />
      {isOpen && isFetching ? (
        <span
          aria-hidden="true"
          className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-rule border-t-ink"
        />
      ) : (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show places"
          // Keep focus in the input; clicking toggles the list like a native select.
          onMouseDown={(event) => {
            event.preventDefault()
            if (isOpen) {
              setIsOpen(false)
            } else {
              inputRef.current?.focus()
              open()
            }
          }}
          className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-faint hover:text-ink"
        >
          <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3" fill="currentColor">
            <path d="M2 4h8L6 8.5z" />
          </svg>
        </button>
      )}

      <div
        hidden={!showList && !showNoMatches}
        className="absolute z-[1100] mt-px w-full border border-ink bg-sheet"
      >
        {showList && !isSearching && (
          <p className="border-b border-rule px-2.5 py-1.5 text-xs font-semibold tracking-wide text-faint uppercase">
            Recent
          </p>
        )}
        <ul id={listboxId} role="listbox" className="max-h-64 overflow-auto">
          {showList &&
            options.map((label, index) => (
              <li
                key={label}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                // mousedown fires before the input's blur, so the click isn't lost.
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(label)
                }}
                className="cursor-pointer border-b border-rule px-2.5 py-2 text-sm text-ink last:border-b-0 hover:bg-paper aria-selected:bg-ink aria-selected:text-white"
              >
                {label}
              </li>
            ))}
        </ul>
        {showNoMatches && (
          <p className="px-2.5 py-2 text-sm text-muted">No matching places in the US.</p>
        )}
      </div>
    </div>
  )
}
