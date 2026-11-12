import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { formatPolicyScore } from "../format-score";
import { buildMatchReview } from "./build-review";
import { ReviewPage } from "./ReviewPage";
import { sampleDocument } from "./sample";

afterEach(cleanup);

const sampleReview = buildMatchReview(sampleDocument().rounds);

describe("post-match review page", () => {
  it("reviews the bundled sample without a match file", () => {
    render(<ReviewPage />);
    const summary = screen.getByTestId("match-summary");
    expect(summary.textContent).toContain(String(sampleReview.roundsConsidered));
    expect(summary.textContent).toContain(String(sampleReview.totalLeaks));
    expect(summary.textContent).toContain(formatPolicyScore(sampleReview.totalEvCost));
    expect(screen.getByTestId("match-source").textContent).toContain("内置样例");
    expect(within(summary).getAllByRole("button")).toHaveLength(sampleReview.highlights.length);
    expect(within(summary).queryAllByRole("link")).toHaveLength(0);

    for (const round of sampleReview.rounds) {
      const card = screen.getByTestId(`round-${round.roundNumber}`);
      expect(card.getAttribute("data-matched")).toBe(round.matched ? "true" : "false");
      expect(card.textContent).toContain(formatPolicyScore(round.chosenExpectedValue ?? Number.NaN));
      const scores = within(card).getByTestId("buy-scores");
      expect(within(scores).getAllByRole("listitem")).toHaveLength(round.options.length);
      const best = within(scores).getByTestId(`buy-score-${round.recommendedBuy}`);
      expect(best.getAttribute("data-best")).toBe("true");
    }

    const round7 = sampleReview.rounds.find((round) => round.roundNumber === 7);
    expect(round7?.chosenBuy).toBe("full");
    expect(round7?.recommendedBuy).toBe("save");
    expect(screen.getByTestId("feedback-7").textContent).toContain("存枪");
    expect(screen.getByTestId("feedback-7").textContent).toContain("4");
    expect(screen.getByTestId("round-7").textContent).toMatch(/\$/);
  });

  it("switches the same review into English", () => {
    render(<ReviewPage />);
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Post-match review");
    expect(screen.getByTestId("feedback-7").textContent).toContain("Save");
    expect(screen.getByTestId("match-source").textContent).toContain("bundled sample");
  });

  it("loads a dropped match file and reports a file the parser rejects", async () => {
    render(<ReviewPage />);
    const drop = screen.getByTestId("match-drop");
    fireEvent.drop(drop, { dataTransfer: dataTransfer(customMatch("Custom"), "custom.json") });
    await waitFor(() => expect(screen.getByTestId("match-label").textContent).toContain("Custom"));
    expect(screen.getByTestId("match-source").textContent).toContain("custom.json");
    expect(screen.getByTestId("round-1").getAttribute("data-matched")).toBe("true");
    expect(screen.queryByTestId("round-7")).toBeNull();

    const input = screen.getByLabelText("选择文件");
    fireEvent.change(input, { target: { files: [new File(["{"], "bad.json", { type: "application/json" })] } });
    await waitFor(() => expect(screen.getByTestId("match-error").textContent).toContain("无法读取"));
    expect(screen.getByTestId("round-1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "载入样例" }));
    expect(screen.queryByTestId("match-error")).toBeNull();
    expect(screen.getByTestId("round-7")).toBeTruthy();
  });
});

function customMatch(label: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    label,
    rounds: [
      {
        roundNumber: 1,
        winner: "us",
        chosenBuy: "full",
        state: {
          roundNumber: 1,
          ourSide: "T",
          ourPlayers: [1, 2, 3, 4, 5].map((id) => ({ id: String(id), cash: 800, hasPrimary: false })),
          history: [],
        },
      },
    ],
  });
}

function dataTransfer(contents: string, name: string): DataTransfer {
  const transfer = new DataTransfer();
  transfer.items.add(new File([contents], name, { type: "application/json" }));
  return transfer;
}
