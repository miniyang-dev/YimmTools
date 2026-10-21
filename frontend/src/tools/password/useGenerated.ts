import { useCallback, useEffect, useState } from 'react'

/** The values produced by `generate`, produced again whenever `generate` changes or `regenerate` is called. */
export function useGenerated(generate: () => string[]): [string[], () => void] {
  const [items, setItems] = useState<string[]>([])
  const regenerate = useCallback(() => setItems(generate()), [generate])
  useEffect(regenerate, [regenerate])
  return [items, regenerate]
}
