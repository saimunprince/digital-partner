/** Which of the three time-of-day greetings to show and speak. Shared so the
 *  spoken welcome and the on-screen heading can never drift apart. */
export function greetingKey(hour: number): 'greetingAfternoon' | 'greetingEvening' | 'greetingMorning' {
  if (hour < 12) {
    return 'greetingMorning'
  }

  return hour < 18 ? 'greetingAfternoon' : 'greetingEvening'
}
