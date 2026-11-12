import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ReviewPage } from "./review/ReviewPage";
import { routeFromHash, type AppRoute } from "./route";
import "./styles.css";
import "./review/review.css";

export function Root() {
  const [route, setRoute] = useState<AppRoute>(() => routeFromHash(window.location.hash));
  useEffect(() => {
    const sync = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return route === "review" ? <ReviewPage /> : <App />;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}
