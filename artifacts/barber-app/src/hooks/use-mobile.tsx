import * as React from "react"

const MOBILE_BREAKPOINT = 1024

function isMobileUA(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent.toLowerCase()
  return /android|iphone|ipad|ipod|mobile|webos|blackberry|opera mini/i.test(ua)
}

export function useIsMobile() {
  const uaMobile = React.useMemo(() => isMobileUA(), [])
  const [isMobile, setIsMobile] = React.useState<boolean>(uaMobile)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT || isMobileUA())
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT || isMobileUA())
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
