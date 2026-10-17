import { describe, expect, it } from "vitest";
import { renderPaymentAccessDecisionEmail } from "@/lib/email/payment-access";
describe("payment-access decision email", () => {
  it("links to the request and escapes business names without implying payment readiness", () => {
    const mail = renderPaymentAccessDecisionEmail({ companyName: "<script>bad</script>", branchName: "Campus counter", approved: true, requestUrl: "https://portal.example/vendor/branches/demo/payment-access" });
    expect(mail.html).not.toContain("<script>"); expect(mail.text).toContain("check payment readiness"); expect(mail.text).toContain("/payment-access");
    const rejected = renderPaymentAccessDecisionEmail({ companyName: "Demo", branchName: "Counter", approved: false, requestUrl: "https://portal.example/request" }); expect(rejected.text).toContain("review the feedback");
  });
});
