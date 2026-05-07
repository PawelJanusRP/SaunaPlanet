export function getReservationMsLeft(reservedUntil: string | null): number {
  if (!reservedUntil) return 0

  return new Date(reservedUntil).getTime() - Date.now()
}

export function isReservationExpired(reservedUntil: string | null): boolean {
  return getReservationMsLeft(reservedUntil) <= 0
}

export function formatReservationTimeLeft(reservedUntil: string | null): string {
  const msLeft = getReservationMsLeft(reservedUntil)

  if (msLeft <= 0) {
    return 'Rezerwacja wygasła'
  }

  const totalSeconds = Math.floor(msLeft / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const restMinutes = minutes % 60
    return `${hours}h ${restMinutes}min`
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}