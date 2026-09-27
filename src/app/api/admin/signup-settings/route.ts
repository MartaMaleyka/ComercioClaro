import { handler, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { signupApprovalSchema } from "@/lib/validation";
import { setSignupApproval, signupApprovalRequired } from "@/server/admin-businesses";

export const GET = handler(async () => {
  await requireSuperAdmin();
  return { requireSignupApproval: await signupApprovalRequired() };
});

export const PUT = handler(async (request) => {
  const admin = await requireSuperAdmin();
  const { enabled } = await parseBody(request, signupApprovalSchema);
  return setSignupApproval(admin, enabled);
});
