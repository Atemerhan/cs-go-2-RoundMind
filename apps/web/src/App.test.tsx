import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

afterEach(() => cleanup());

function recommendation() {
  return screen.getByTestId("recommendation");
}

describe("calculator", () => {
  it("shows an eco call for the loss-streak preset", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("preset-eco"));
    expect(recommendation().getAttribute("data-buy")).toBe("eco");
    expect(recommendation().textContent).toContain("白给");
  });

  it("switches the same call into English", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("preset-eco"));
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(recommendation().textContent).toContain("Eco");
    expect(screen.getByText(/Not enough for a gun/)).toBeTruthy();
  });

  it("full-buys the pistol preset", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "手枪局" }));
    expect(recommendation().getAttribute("data-buy")).toBe("full");
  });

  it("changes the call after a completed round is added", () => {
    render(<App />);
    expect(recommendation().getAttribute("data-buy")).toBe("full");
    fireEvent.click(screen.getByRole("button", { name: "加入回合" }));
    expect(recommendation().getAttribute("data-buy")).not.toBe("full");
    expect(screen.getByText(/回合 1/)).toBeTruthy();
  });
});
