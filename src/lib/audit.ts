import { db } from "@/lib/db";
import crypto from "crypto";

interface AuditLogInput {
  action: string;
  resource: string;
  resourceId?: string;
  resourceType?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  ipAddress?: string;
  userAgent?: string;
  beforeSnapshot?: any;
  afterSnapshot?: any;
  metadata?: any;
  severity?: string;
  teamId?: string;
}

export async function createAuditLog(input: AuditLogInput) {
  // Get the last audit log entry for hash chain
  const lastEntry = await db.auditLog.findFirst({
    orderBy: { createdAt: "desc" },
    select: { entryHash: true },
  });

  const previousHash = lastEntry?.entryHash || "genesis";

  // Compute entry hash
  const hashPayload = JSON.stringify({
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId,
    userId: input.userId,
    previousHash,
    timestamp: new Date().toISOString(),
  });

  const entryHash = crypto.createHash("sha256").update(hashPayload).digest("hex");

  return db.auditLog.create({
    data: {
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      resourceType: input.resourceType,
      userId: input.userId,
      userEmail: input.userEmail,
      userName: input.userName,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      beforeSnapshot: input.beforeSnapshot ?? undefined,
      afterSnapshot: input.afterSnapshot ?? undefined,
      metadata: input.metadata ?? undefined,
      previousHash,
      entryHash,
      severity: input.severity || "info",
      teamId: input.teamId,
    },
  });
}
