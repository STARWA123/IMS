import { NextResponse } from "next/server";
import { assertSameOrigin, requireUser, requireWorkspaceOwner } from "../../../../../../../src/modules/auth/authorization";
import { authErrorResponse } from "../../../../../../../src/modules/auth/http";
import {
  InvalidJobImportFileError,
  maxJobImportFileBytes,
  previewJobImport,
} from "../../../../../../../src/modules/data-management/job-import-service";
import { WorkspaceNotFoundError } from "../../../../../../../src/modules/workspace/workspace-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

function validateFile(file: File): string | null {
  if (!file.name.toLocaleLowerCase("en-US").endsWith(".xlsx")) {
    return "仅支持 .xlsx 文件。";
  }
  if (!file.size) {
    return "Excel 文件为空。";
  }
  if (file.size > maxJobImportFileBytes) {
    return "Excel 文件不能超过 5 MB。";
  }
  return null;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { workspaceId } = await context.params;
    await requireWorkspaceOwner(user.id, workspaceId);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择 Excel 文件。" }, { status: 400 });
    }
    const fileError = validateFile(file);
    if (fileError) {
      return NextResponse.json({ error: fileError }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await previewJobImport(workspaceId, buffer, file.name);
    return NextResponse.json({ preview });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) return response;
    if (error instanceof WorkspaceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidJobImportFileError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
