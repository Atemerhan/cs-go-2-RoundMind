import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ecoSnapshot, evaluateBuyOptions, type BuyClass } from "@roundmind/engine";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { BuyOptionScores } from "./BuyOptionScores";
import { formatPolicyScore } from "./format-score";

afterEach(cleanup);

const options = [
  { buy: "full" as const, expectedValue: 1 },
  { buy: "force" as const, expectedValue: 0.5 },
  { buy: "eco" as const, expectedValue: 4 },
  { buy: "save" as const, expectedValue: -1.25 },
];

describe("formatPolicyScore", () => {
  it("prints loss-bonus steps without trailing zeros", () => {
    expect(formatPolicyScore(3)).toBe("3");
    expect(formatPolicyScore(3.44)).toBe("3.44");
    expect(formatPolicyScore(-1.25)).toBe("-1.25");
    expect(formatPolicyScore(-0)).toBe("0");
  });
});

describe("BuyOptionScores", () => {
  it("shows every considered buy and the gap to the winner", () => {
    render(<BuyOptionScores lang="zh" options={options} recommended="eco" />);
    const list = screen.getByTestId("buy-scores");
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    const eco = within(list).getByTestId("buy-score-eco");
    expect(eco.getAttribute("data-best")).toBe("true");
    expect(eco.textContent).toContain("白给");
    expect(eco.textContent).toContain("4");
    expect(eco.textContent).toContain("最高");

    const full = within(list).getByTestId("buy-score-full");
    expect(full.getAttribute("data-best")).toBe("false");
    expect(full.textContent).toContain("1");
    expect(full.textContent).toContain("少 3 档");

    const save = within(list).getByTestId("buy-score-save");
    expect(save.textContent).toContain("-1.25");
    expect(save.textContent).toContain("少 5.25 档");
  });

  it("does not crown a buy when the freeze call is empty", () => {
    render(<BuyOptionScores lang="en" options={options.map((row) => ({ ...row, expectedValue: 0 }))} recommended={null} />);
    for (const buy of ["full", "force", "eco", "save"] as const) {
      expect(screen.getByTestId(`buy-score-${buy}`).getAttribute("data-best")).toBe("false");
    }
    expect(screen.getByTestId("buy-scores").parentElement?.textContent).toContain("Every buy the engine considers");
  });
});

describe("calculator scores", () => {
  it("prints the engine score of each buy on the eco preset", () => {
    const scored = evaluateBuyOptions(ecoSnapshot());
    render(<App />);
    fireEvent.click(screen.getByTestId("preset-eco"));
    const list = screen.getByTestId("buy-scores");
    for (const row of scored) {
      const item = within(list).getByTestId(`buy-score-${row.buy}`);
      expect(item.textContent).toContain(formatPolicyScore(row.expectedValue));
      expect(item.getAttribute("data-best")).toBe(row.buy === "eco" ? "true" : "false");
    }
    const best = scored.reduce((top, row) => (row.expectedValue > top.expectedValue ? row : top));
    expect(best.buy).toBe("eco" satisfies BuyClass);
  });

  it("explains the score unit in English", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByTestId("buy-scores").parentElement?.textContent).toContain("$500 loss bonus");
    expect(screen.getByRole("link", { name: "Review" })).toBeTruthy();
  });
});
