import { useEffect, useState } from 'react'

// Jediný breakpoint pro JS větvení (musí sedět s CSS — viz sekce MOBILE ve
// styles.css, hlavička Phase 1 je zdroj pravdy): pod ním se UI chová „mobilně"
// (sheety místo kontextových menu / rolet, select-mode místo Ctrl-kliku).
export const MOBILE_MQ = '(max-width: 899.98px)'

/** Živě sleduje mobilní breakpoint (resize/rotace přepne chování bez reloadu). */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_MQ).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ)
    const onChange = (e: MediaQueryListEvent): void => setMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}
