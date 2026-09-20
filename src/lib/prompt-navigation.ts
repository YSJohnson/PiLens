export interface PromptOffset {
  id: string
  top: number
}

export function findActivePromptId(
  prompts: readonly PromptOffset[],
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): string | undefined {
  if (!prompts.length) return undefined
  if (scrollTop + clientHeight >= scrollHeight - 48) return prompts.at(-1)?.id

  const readLine = scrollTop + Math.min(100, clientHeight * 0.35)
  let low = 0
  let high = prompts.length - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (prompts[middle].top <= readLine) low = middle + 1
    else high = middle - 1
  }
  return prompts[Math.max(0, high)].id
}

export function samplePromptIndexes(total: number, maximum = 30): number[] {
  if (total <= 0) return []
  if (total <= maximum) return Array.from({ length: total }, (_, index) => index)
  return Array.from({ length: maximum }, (_, index) => Math.round(index * (total - 1) / (maximum - 1)))
}
