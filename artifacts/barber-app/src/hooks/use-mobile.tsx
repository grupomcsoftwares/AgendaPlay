import * as React from "react"

const MOBILE_BREAKPOINT = 1024

function isMobileUA(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent.toLowerCase()
  return /android|iphone|ipad|ipod|mobile|webos|blackberry|opera mini/i.test(ua)
}

function hasMobileParam(): boolean {
  if (typeof window === "undefined") return false
  return window.location.search.includes("view=mobile") || !!(window as any).__AGENDAPLAY_MOBILE__
}

export function useIsMobile() {
  const uaMobile = React.useMemo(() => isMobileUA() || hasMobileParam(), [])
  const [isMobile, setIsMobile] = React.useState<boolean>(uaMobile)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT || isMobileUA() || hasMobileParam())
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT || isMobileUA() || hasMobileParam())
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
