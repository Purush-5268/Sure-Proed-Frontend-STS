import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * ScrollToTop component restores the window scroll position to (0,0)
 * whenever the route changes (detected via useLocation).
 * Must be placed inside <BrowserRouter>.
 */
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export default ScrollToTop;
