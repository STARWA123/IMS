import { NextResponse } from "next/server";
import { assertSameOrigin, requireUser, requireWorkspaceOwner } from "../../../../../../../src/modules/auth/authorization";
import { authErrorResponse } from "../../../../../../../src/modules/auth/http";
import type { EventType } from "../../../../../../../src/generated/prisma/client";
import {
  CompanyOfferConflictError,
  JobNotFoundError,
} from "../../../../../../../src/modules/job/job-service";
import { eventTypes as eventTypeValues } from "../../../../../../../src/modules/job/recruitment-presentation";
import {
  createTimelineEvent,
  listTimelineEvents,
} from "../../../../../../../src/modules/timeline/timeline-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string; jobId: string }>;
};

const eventTypes = new Set<EventType>(eventTypeValues);

function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && eventTypes.has(value as EventType);
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { workspaceId, jobId } = await context.params;
    await requireWorkspaceOwner(user.id, workspaceId);
    return NextResponse.json({
      timeline: await listTimelineEvents(workspaceId, jobId),
    });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    if (error instanceof JobNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { workspaceId, jobId } = await context.params;
    await requireWorkspaceOwner(user.id, workspaceId);
    const body = (await request.json()) as Record<string, unknown>;
    if (
      !isEventType(body.eventType) ||
      typeof body.eventDate !== "string" ||
      !isOptionalString(body.remark) ||
      (body.syncStage !== undefined && typeof body.syncStage !== "boolean")
    ) {
      return NextResponse.json(
        { error: "Timeline 信息格式无效。" },
        { status: 400 },
      );
    }
    const result = await createTimelineEvent(
      workspaceId,
      jobId,
      {
        eventType: body.eventType,
        eventDate: body.eventDate,
        remark: body.remark,
      },
      body.syncStage ?? false,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    if (error instanceof JobNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof CompanyOfferConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
