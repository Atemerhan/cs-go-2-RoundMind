export type AppRoute = "calculator" | "review";

/** Hash route so the review page works on static GitHub Pages. */
export function routeFromHash(hash: string): AppRoute {
  const name = hash.replace(/^#/, "").replace(/^\//, "").split(/[?#]/)[0] ?? "";
  return name === "review" ? "review" : "calculator";
}
