import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "crypto";

// POST /api/audit/verify — Verify audit log hash chain integrity
export async function POST() {
  try {
    const logs = await db.auditLog.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        action: true,
        resource: true,
        resourceId: true,
        userId: true,
        previousHash: true,
        entryHash: true,
        createdAt: true,
        chainValid: true,
      },
    });

    if (logs.length === 0) {
      return NextResponse.json({
        valid: true,
        totalEntries: 0,
        tamperedEntries: 0,
        tamperedIds: [],
        message: "No audit log entries to verify",
      });
    }

    const tamperedIds: string[] = [];
    let expectedPreviousHash = "genesis";

    for (const log of logs) {
      // Recompute the expected hash
      const hashPayload = JSON.stringify({
        action: log.action,
        resource: log.resource,
        resourceId: log.resourceId,
        userId: log.userId,
        previousHash: expectedPreviousHash,
        timestamp: log.createdAt.toISOString(),
      });

      const expectedHash = crypto.createHash("sha256").update(hashPayload).digest("hex");

      // Check previous hash matches
      if (log.previousHash !== expectedPreviousHash) {
        tamperedIds.push(log.id);
        await db.auditLog.update({
          where: { id: log.id },
          data: { chainValid: false },
        });
      } else if (log.entryHash !== expectedHash) {
        tamperedIds.push(log.id);
        await db.auditLog.update({
          where: { id: log.id },
          data: { chainValid: false },
        });
      } else if (!log.chainValid) {
        // Was marked invalid but now passes — fix it
        await db.auditLog.update({
          where: { id: log.id },
          data: { chainValid: true },
        });
      }

      expectedPreviousHash = log.entryHash;
    }

    return NextResponse.json({
      valid: tamperedIds.length === 0,
      totalEntries: logs.length,
      tamperedEntries: tamperedIds.length,
      tamperedIds,
      message: tamperedIds.length === 0
        ? "All audit log entries have valid hash chains"
        : `${tamperedIds.length} entry(ies) have tampered hash chains`,
    });
  } catch (error) {
    console.error("Failed to verify audit log chain:", error);
    return NextResponse.json({ error: "Failed to verify audit log chain" }, { status: 500 });
  }
}
