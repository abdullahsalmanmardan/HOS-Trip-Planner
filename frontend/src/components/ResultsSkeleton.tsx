function Block({ className }: { className: string }) {
  return <div className={`animate-pulse bg-rule/60 ${className}`} />
}

export function ResultsSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-5 py-6">
      <span className="sr-only">Planning your trip...</span>
      <Block className="h-6 w-1/2" />
      <Block className="h-14 w-full" />
      <Block className="h-[380px] w-full" />
      <div className="space-y-px">
        {[0, 1, 2, 3, 4].map((index) => (
          <Block key={index} className="h-9 w-full" />
        ))}
      </div>
    </div>
  )
}
