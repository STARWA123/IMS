import { randomUUID } from "node:crypto";
import { db } from "../src/db/client";
import { createTestOwner } from "./test-user-helper";

const verificationId = randomUUID();
const primaryWorkspaceId = `verify-workspace-${verificationId}`;
const otherWorkspaceId = `verify-other-workspace-${verificationId}`;
const companyId = `verify-company-${verificationId}`;
const jobId = `verify-job-${verificationId}`;
const eventId = `verify-event-${verificationId}`;

async function verifyRelations(): Promise<void> {
  const owner = await createTestOwner(verificationId);
  try {
    await db.workspace.createMany({
      data: [
        {
          id: primaryWorkspaceId,
          ownerId: owner.id,
          name: "Relation verification workspace",
        },
        {
          id: otherWorkspaceId,
          ownerId: owner.id,
          name: "Cross-workspace verification workspace",
        },
      ],
    });

    await db.company.create({
      data: {
        id: companyId,
        workspaceId: primaryWorkspaceId,
        name: "Verification Company",
      },
    });

    await db.job.create({
      data: {
        id: jobId,
        workspaceId: primaryWorkspaceId,
        companyId,
        jobName: "Verification Job",
        baseLocation: "Verification Base",
      },
    });

    await db.timelineEvent.create({
      data: {
        id: eventId,
        jobId,
        eventType: "APPLIED",
        eventDate: new Date(),
      },
    });

    const jobWithRelations = await db.job.findUnique({
      where: { id: jobId },
      include: {
        company: { include: { workspace: true } },
        timelineEvents: true,
      },
    });

    if (
      jobWithRelations?.company.workspace.id !== primaryWorkspaceId ||
      jobWithRelations.timelineEvents[0]?.id !== eventId
    ) {
      throw new Error("Relation traversal verification failed.");
    }

    let mismatchedWorkspaceRejected = false;
    try {
      await db.job.create({
        data: {
          id: `verify-invalid-job-${verificationId}`,
          workspaceId: otherWorkspaceId,
          companyId,
          jobName: "Invalid cross-workspace job",
          baseLocation: "Invalid Base",
        },
      });
    } catch {
      mismatchedWorkspaceRejected = true;
    }

    if (!mismatchedWorkspaceRejected) {
      throw new Error("A cross-workspace Job/Company relation was accepted.");
    }

    await db.job.update({
      where: { id: jobId },
      data: { stage: "OFFER" },
    });

    let secondOfferRejected = false;
    try {
      await db.job.create({
        data: {
          id: `verify-second-offer-${verificationId}`,
          workspaceId: primaryWorkspaceId,
          companyId,
          jobName: "Invalid second offer",
          baseLocation: "Verification Base",
          stage: "OFFER",
        },
      });
    } catch {
      secondOfferRejected = true;
    }

    if (!secondOfferRejected) {
      throw new Error("A second OFFER for the same company was accepted.");
    }

    await db.workspace.delete({ where: { id: primaryWorkspaceId } });

    const [companies, jobs, events] = await Promise.all([
      db.company.count({ where: { id: companyId } }),
      db.job.count({ where: { id: jobId } }),
      db.timelineEvent.count({ where: { id: eventId } }),
    ]);

    if (companies !== 0 || jobs !== 0 || events !== 0) {
      throw new Error("Workspace cascade deletion verification failed.");
    }

    console.info(
      "Database relations verified: traversal, workspace isolation, one-offer constraint, and cascade deletion all passed.",
    );
  } finally {
    await db.user.delete({ where: { id: owner.id } });
  }
}

verifyRelations()
  .catch((error: unknown) => {
    console.error("Database relation verification failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
