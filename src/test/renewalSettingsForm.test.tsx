import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ preview: vi.fn(), save: vi.fn() }));
vi.mock("@/app/(admin)/settings/actions", () => ({
  getRenewalSettingsPreviewAction: mocks.preview,
  saveRenewalSettingsAction: mocks.save,
}));
import { RenewalSettingsForm } from "@/app/(admin)/settings/RenewalSettingsForm";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.preview.mockResolvedValue({ affected: 3, overdue: 1, changes: [] });
  mocks.save.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("previews DD-MM dates and saves only after the site's confirmation", async () => {
  const nativeConfirm = vi.spyOn(window, "confirm");
  render(<RenewalSettingsForm startDate="01-02" expiryDate="30-11" canEdit />);
  expect(screen.getByLabelText(/Annual start/)).toHaveValue("01-02");
  fireEvent.click(screen.getByRole("button", { name: "Save period" }));
  await screen.findByRole("dialog");
  expect(mocks.preview).toHaveBeenCalledWith("01-02", "30-11");
  expect(mocks.save).not.toHaveBeenCalled();
  expect(nativeConfirm).not.toHaveBeenCalled();
  fireEvent.click(
    await screen.findByRole("button", { name: "Confirm and save" }),
  );
  await screen.findByRole("status");
  const data = mocks.save.mock.calls[0][0] as FormData;
  expect(data.get("startDate")).toBe("01-02");
  expect(data.get("expiryDate")).toBe("30-11");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("cancels without changing the policy", async () => {
  render(<RenewalSettingsForm startDate="01-02" expiryDate="30-11" canEdit />);
  fireEvent.click(screen.getByRole("button", { name: "Save period" }));
  await screen.findByRole("dialog");
  const cancel = await screen.findByRole("button", { name: "Cancel" });
  await waitFor(() => expect(cancel).not.toBeDisabled());
  fireEvent.click(cancel);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("keeps the confirmation open when saving fails", async () => {
  mocks.save.mockRejectedValue(new Error("Unable to save policy"));
  render(<RenewalSettingsForm startDate="01-02" expiryDate="30-11" canEdit />);
  fireEvent.click(screen.getByRole("button", { name: "Save period" }));
  await screen.findByRole("dialog");
  fireEvent.click(
    await screen.findByRole("button", { name: "Confirm and save" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to save policy",
    ),
  );
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
it("shows read-only settings to an issuer", () => {
  render(
    <RenewalSettingsForm
      startDate="01-02"
      expiryDate="30-11"
      canEdit={false}
    />,
  );
  expect(screen.getByLabelText(/Annual start/)).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Save period" }),
  ).not.toBeInTheDocument();
});
