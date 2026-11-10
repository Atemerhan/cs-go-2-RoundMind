import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { GSI_PROXY_PATH } from "./gsi";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

  it("shows team buying power and edits cash and primaries", () => {
    render(<App />);
    const power = screen.getByTestId("buying-power");
    expect(power.textContent).toContain("$4,000");
    expect(power.textContent).toContain("0/5");
    expect(power.textContent).toContain("$3,700");
    fireEvent.change(screen.getByRole("spinbutton", { name: "玩家 1 现金" }), { target: { value: "4000" } });
    expect(power.textContent).toContain("$7,200");
    expect(power.textContent).toContain("1/5");
    expect(screen.getByText("够满购")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "玩家 1 有主武器" }));
    expect(screen.getByRole("button", { name: "玩家 1 有主武器" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(power).getByText("有主武器").parentElement?.textContent).toContain("1/5");
  });

  it("edits and removes a completed round", () => {
    render(<App />);
    fireEvent.click(screen.getByText("可选：存活与击杀奖金"));
    fireEvent.change(screen.getByRole("spinbutton", { name: "匪存活" }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "加入回合" }));
    expect(screen.getByText(/匪存活 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "回合 1 警获胜" }));
    expect(screen.getByRole("button", { name: "回合 1 警获胜" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByRole("combobox", { name: "回合 1 结束方式" }), { target: { value: "bomb_defuse" } });
    expect(screen.getByRole("combobox", { name: "回合 1 结束方式" })).toHaveProperty("value", "bomb_defuse");
    fireEvent.click(screen.getByRole("button", { name: "删除回合 1" }));
    expect(screen.queryByRole("button", { name: "删除回合 1" })).toBeNull();
    expect(recommendation().getAttribute("data-buy")).toBe("full");
  });

  it("marks the overtime loss-count warning as unverified", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "加时" }));
    const warnings = screen.getByTestId("warnings");
    expect(warnings.textContent).toContain("未核实");
    expect(warnings.textContent).toContain("连败计数");
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByTestId("warnings").textContent).toMatch(/Unverified/i);
    expect(screen.getByRole("button", { name: "Live (GSI)" })).toBeTruthy();
    expect(screen.getByText(/127\.0\.0\.1:3000\/state/)).toBeTruthy();
    expect(screen.getByTestId("enemy-band")).toBeTruthy();
  });

  it("uses a listener snapshot and falls back when it is down", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url) === GSI_PROXY_PATH) {
        return { ok: true, text: async () => JSON.stringify(liveEco()) };
      }
      return { ok: false, text: async () => "" };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    expect(recommendation().getAttribute("data-buy")).toBe("full");
    fireEvent.click(screen.getByRole("button", { name: "本机直播（GSI）" }));
    await waitFor(() => expect(recommendation().getAttribute("data-buy")).toBe("eco"));
    expect(screen.getByTestId("gsi-status").textContent).toContain("已连上");
    expect(screen.getByTestId("call-source").textContent).toContain("本机 GSI");
    const power = screen.getByTestId("buying-power");
    expect(power.textContent).toContain("$8,000");
    expect(power.textContent).not.toContain("99,999");
    expect(document.body.textContent).not.toContain("99999");

    fetchMock.mockImplementation(async () => {
      throw new Error("offline");
    });
    await waitFor(() => expect(screen.getByTestId("gsi-status").textContent).toContain("监听没开"), { timeout: 2500 });
    expect(recommendation().getAttribute("data-buy")).toBe("full");
    expect(screen.getByTestId("call-source").textContent).toContain("手动");
  });

  it("returns to the manual form when the round leaves freeze time", async () => {
    let phase = "freezetime";
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      text: async () => JSON.stringify({ ...liveEco(), round: { phase } }),
    }));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "本机直播（GSI）" }));
    await waitFor(() => expect(recommendation().getAttribute("data-buy")).toBe("eco"));

    phase = "live";
    await waitFor(() => expect(screen.getByTestId("gsi-status").textContent).toContain("当前使用手动表"), { timeout: 2500 });
    expect(recommendation().getAttribute("data-buy")).toBe("full");
    expect(screen.getByTestId("call-source").textContent).toContain("手动");
  });
});

function liveEco() {
  return {
    match: { round: 3 },
    round: { phase: "freezetime" },
    score: { ct: 0, t: 2, ctConsecutiveLosses: 2, tConsecutiveLosses: 0 },
    playerSide: "CT",
    economies: {
      CT: {
        players: [1, 2, 3, 4, 5].map((id) => ({
          steamId: `ct-${id}`,
          team: "CT",
          money: 1600,
          weapons: [{ name: "weapon_usp_silencer", type: "Pistol" }],
        })),
      },
      T: {
        players: [{ steamId: "t-rich", team: "T", money: 99999, weapons: [{ name: "weapon_ak47", type: "Rifle" }] }],
      },
    },
    recentRoundOutcomes: [
      { winner: "T", reason: "elimination", ctScore: 0, tScore: 1 },
      { winner: "T", reason: "elimination", ctScore: 0, tScore: 2 },
    ],
  };
}
