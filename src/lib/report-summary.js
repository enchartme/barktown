/** Format a duration without seconds, truncating incomplete minutes. */
export function formatDisturbedTime(totalDurationSec) {
  const totalMinutes = Math.floor(Math.max(0, totalDurationSec) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}
