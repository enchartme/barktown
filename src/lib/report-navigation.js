/**
 * Return the adjacent entry in the report's current display order.
 *
 * @template T extends { id: string }
 * @param {T[]} orderedEntries
 * @param {string} currentId
 * @param {-1 | 1} direction
 * @returns {T | null}
 */
export function adjacentReportEntry(orderedEntries, currentId, direction) {
  const currentIndex = orderedEntries.findIndex((entry) => entry.id === currentId);
  if (currentIndex < 0) return null;
  return orderedEntries[currentIndex + direction] ?? null;
}
