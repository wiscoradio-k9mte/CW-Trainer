// @vitest-environment jsdom
//
// COMPONENT-LEVEL bite tests for CompactSelect (the standard compact-selector).
//
// These drive the component in isolation via a controlled harness so the
// load-bearing contracts are asserted directly on produced output:
//   - onChange fires EXACTLY ONCE, on commit (Enter / Space / click) — and NEVER
//     on navigation (arrows / typeahead). This is the guard that keeps pickCat's
//     keyer.clear() and QSO's activity→role reset from firing on every arrow.
//   - keyboard navigation moves aria-activedescendant only (no commit).
//   - Esc closes without committing (value unchanged).
//   - the selected option carries a NON-COLOR cue (✓ glyph + weight 700).
//   - the combobox exposes an accessible name.
//
// Each assertion is on real output (call count + argument, the activedescendant
// id, the DOM/text), so a mutation to the behavior turns it RED. The commit-once
// tests were verified to bite by mutating the component (arrow made to commit →
// RED; Enter made a no-op → RED), then restored.

import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompactSelect } from "../../wr-cw-trainer.jsx";

const OPTS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
  { value: "c", label: "Charlie" },
];

// Controlled wrapper: mirrors how the app uses CompactSelect (value in parent
// state, onChange updates it). The spy sees every real commit.
function Harness({ onChange, options = OPTS, initial = "a" }) {
  const [val, setVal] = useState(initial);
  return (
    <CompactSelect
      label="Test label"
      options={options}
      value={val}
      onChange={(v) => { onChange?.(v); setVal(v); }}
    />
  );
}

describe("CompactSelect — commit semantics (the load-bearing guard)", () => {
  it("fires onChange EXACTLY ONCE on Enter, and NEVER while arrowing", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    const trigger = screen.getByRole("combobox", { name: "Test label" });
    await user.click(trigger); // open (active = current = Alpha, index 0)

    // Two arrow-downs move the highlight to Charlie (index 2). Navigation must NOT
    // commit — this is the exact behavior pickCat/role-reset depend on.
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(onChange).not.toHaveBeenCalled();

    // Enter commits the ACTIVE option (Charlie) — once, with its value.
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("commits on click — once, with the clicked option's value, and closes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    const trigger = screen.getByRole("combobox", { name: "Test label" });
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Bravo" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent("Bravo");
  });

  it("commits on Space (open) — once", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    const trigger = screen.getByRole("combobox", { name: "Test label" });
    await user.click(trigger);        // open, active = Alpha
    await user.keyboard("{ArrowDown}"); // → Bravo, no commit
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard("[Space]");    // commit Bravo
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("CompactSelect — navigation moves the highlight only", () => {
  it("ArrowDown moves aria-activedescendant to the next option, no commit", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    const trigger = screen.getByRole("combobox", { name: "Test label" });
    await user.click(trigger);
    const options = screen.getAllByRole("option");
    // Opens with the selected option (Alpha, index 0) active.
    expect(trigger).toHaveAttribute("aria-activedescendant", options[0].id);

    await user.keyboard("{ArrowDown}");
    expect(trigger).toHaveAttribute("aria-activedescendant", options[1].id);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("typeahead moves the highlight to the matching option, no commit", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    const trigger = screen.getByRole("combobox", { name: "Test label" });
    await user.click(trigger);
    const options = screen.getAllByRole("option");

    // Typing "c" jumps the highlight to "Charlie" (index 2) — highlight only.
    await user.keyboard("c");
    expect(trigger).toHaveAttribute("aria-activedescendant", options[2].id);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("CompactSelect — Esc closes without committing", () => {
  it("Esc after arrowing leaves the value unchanged and closes the panel", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    const trigger = screen.getByRole("combobox", { name: "Test label" });
    await user.click(trigger);
    await user.keyboard("{ArrowDown}"); // highlight Bravo
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    // Trigger still reflects the original value.
    expect(trigger).toHaveTextContent("Alpha");
  });
});

describe("CompactSelect — non-color selected cue and accessible name", () => {
  it("the selected option carries a ✓ glyph AND weight 700 (both non-color signals)", async () => {
    const user = userEvent.setup();
    render(<Harness initial="a" />);

    const trigger = screen.getByRole("combobox", { name: "Test label" });
    await user.click(trigger);

    const selected = screen.getByRole("option", { name: "Alpha" });
    expect(selected).toHaveAttribute("aria-selected", "true");
    // Shape cue: the ✓ mark is in the selected row's text.
    expect(selected.textContent).toContain("✓");
    // Weight cue: the selected label is weight 700 (survives grayscale, not color-only).
    const labelSpan = within(selected).getByText("Alpha");
    expect(labelSpan).toHaveStyle({ fontWeight: "700" });

    // A non-selected option has neither cue.
    const other = screen.getByRole("option", { name: "Bravo" });
    expect(other).toHaveAttribute("aria-selected", "false");
    expect(other.textContent).not.toContain("✓");
    expect(within(other).getByText("Bravo")).toHaveStyle({ fontWeight: "400" });
  });

  it("exposes an accessible name from its visible label", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "Test label" });
    expect(trigger).toHaveAccessibleName("Test label");
  });

  it("renders a ladderIndex numeral when options carry one (decorative, aria-hidden)", async () => {
    const user = userEvent.setup();
    const ladder = [
      { value: "a", label: "Alpha", ladderIndex: 1 },
      { value: "b", label: "Bravo", ladderIndex: 2 },
    ];
    render(<Harness options={ladder} />);
    const trigger = screen.getByRole("combobox", { name: "Test label" });
    // Trigger shows "1 — Alpha" (rung numeral prefixes the selected label).
    expect(trigger).toHaveTextContent("1 — Alpha");

    await user.click(trigger);
    // The option's accessible name stays the bare label (the numeral is aria-hidden),
    // so numeral rendering never pollutes the option's programmatic name.
    expect(screen.getByRole("option", { name: "Bravo" })).toBeInTheDocument();
  });
});
