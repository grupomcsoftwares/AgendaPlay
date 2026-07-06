import * as React from "react"

const MOBILE_BREAKPOINT = 1024

function isMobileUA(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent.toLowerCase()
  return /android|iphone|ipad|ipod|mobile|webos|blackberry|opera mini/i.test(ua)
}

function hasMobileParam(): boolean {
  if (typeof window === "undefined") return false
  return window.location.search.includes("view=mobile") ||
    !!(window as any).__AGENDAPLAY_MOBILE__ ||
    document.documentElement.classList.contains("mobile-view")
}

export function useIsMobile() {
  // Default to FALSE (desktop) — true mobile detection comes from viewport width
  const [isMobile, setIsMobile] = React.useState<boolean>(false)

  React.useEffect(() => {
    const check = () => {
      const vw = window.innerWidth
      setIsMobile(vw < MOBILE_BREAKPOINT || isMobileUA() || hasMobileParam())
    }
    check()
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    mql.addEventListener("change", check)
    window.addEventListener("resize", check)
    return () => {
      mql.removeEventListener("change", check)
      window.removeEventListener("resize", check)
    }
  }, [])

  return isMobile
}
