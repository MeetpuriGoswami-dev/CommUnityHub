import { Router, type IRouter } from "express";
import { SendChatMessageBody } from "@workspace/api-zod";
import { detectIntents, executeIntents, getQuickPrompts } from "../lib/ai.ts";
import { getCurrentUser, isOrgActive } from "../lib/auth.ts";

const router: IRouter = Router();

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const organizationId = parsed.data.organizationId ?? 1;
  const message = parsed.data.message;

  const current = await getCurrentUser(req.headers.cookie);
  if (!(await isOrgActive(organizationId)) && current?.role !== "super_admin") {
    res.status(403).json({ error: "This organization is deactivated. AI services are suspended." });
    return;
  }

  const intents = detectIntents(message);
  const result = await executeIntents(intents, organizationId, message);
  const quickPrompts = await getQuickPrompts(organizationId);

  res.json({
    message: result.message,
    quickPrompts,
    isOutOfScope: result.isOutOfScope
  });
});

export default router;
