"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import type {
  JobImportPreview,
  JobImportResult,
} from "../../modules/data-management/job-import-types";
import {
  stageLabels,
  timelineEventLabels,
} from "../../modules/job/recruitment-presentation";
import { DialogShell } from "../shared/dialog-shell";

type ImportStep = "select" | "preview" | "importing" | "complete";

const maxFileBytes = 5 * 1024 * 1024;

function formatEventDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function statusLabel(status: "ready" | "duplicate" | "error"): string {
  if (status === "ready") {
    return "可导入";
  }
  return status === "duplicate" ? "跳过" : "错误";
}

export function JobImportDialog({
  workspaceId,
  workspaceName,
  onClose,
  onImported,
}: {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onImported: () => void;
}): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>("select");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<JobImportPreview | null>(null);
  const [result, setResult] = useState<JobImportResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = parsing || step === "importing";

  function openFilePicker(): void {
    if (!busy) {
      inputRef.current?.click();
    }
  }

  async function parseFile(selectedFile: File): Promise<void> {
    setError(null);
    setDragActive(false);
    if (!selectedFile.name.toLocaleLowerCase("en-US").endsWith(".xlsx")) {
      setError("仅支持 .xlsx 文件。");
      return;
    }
    if (!selectedFile.size) {
      setError("Excel 文件为空。");
      return;
    }
    if (selectedFile.size > maxFileBytes) {
      setError("Excel 文件不能超过 5 MB。");
      return;
    }

    setParsing(true);
    setStep("select");
    setPreview(null);
    setFile(selectedFile);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await fetch(
        `/api/workspaces/${workspaceId}/jobs/import/preview`,
        { method: "POST", body: formData },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: unknown;
        preview?: JobImportPreview;
      } | null;
      if (!response.ok || !body?.preview) {
        throw new Error(
          typeof body?.error === "string" ? body.error : "无法解析 Excel 文件。",
        );
      }
      setPreview(body.preview);
      setStep("preview");
    } catch (requestError: unknown) {
      setFile(null);
      setError(
        requestError instanceof Error ? requestError.message : "无法解析 Excel 文件。",
      );
    } finally {
      setParsing(false);
    }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>): void {
    const selectedFile = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (selectedFile) {
      void parseFile(selectedFile);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    if (busy) {
      return;
    }
    const selectedFile = event.dataTransfer.files[0];
    if (selectedFile) {
      void parseFile(selectedFile);
    }
  }

  async function confirmImport(): Promise<void> {
    if (!file || !preview || preview.errorRows || !preview.readyRows) {
      return;
    }
    setError(null);
    setStep("importing");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/workspaces/${workspaceId}/jobs/import`, {
        method: "POST",
        body: formData,
      });
      const body = (await response.json().catch(() => null)) as {
        error?: unknown;
        result?: JobImportResult;
        preview?: JobImportPreview;
      } | null;
      if (!response.ok || !body?.result) {
        if (body?.preview) {
          setPreview(body.preview);
        }
        throw new Error(
          typeof body?.error === "string" ? body.error : "岗位导入失败。",
        );
      }
      setResult(body.result);
      setStep("complete");
      onImported();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : "岗位导入失败。",
      );
      setStep("preview");
    }
  }

  return (
    <DialogShell
      className="job-import-dialog"
      closeDisabled={busy}
      description={`目标 Workspace：${workspaceName}`}
      onClose={onClose}
      showClose={step !== "complete"}
      title={step === "complete" ? "导入完成" : "导入岗位"}
    >
      <input
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={chooseFile}
        ref={inputRef}
        type="file"
      />

      <ol className="import-steps" aria-label="Excel 导入进度">
        {[
          ["select", "1", "选择文件"],
          ["preview", "2", "数据预检"],
          ["complete", "3", "导入完成"],
        ].map(([stepName, number, label]) => {
          const order = { select: 0, preview: 1, importing: 1, complete: 2 } as const;
          const currentOrder = order[step];
          const itemOrder = order[stepName as "select" | "preview" | "complete"];
          return (
            <li
              className={itemOrder < currentOrder ? "done" : itemOrder === currentOrder ? "active" : ""}
              key={stepName}
            >
              <span>{number}</span>
              {label}
            </li>
          );
        })}
      </ol>

      {step === "select" ? (
        <>
          <div className="import-template-row">
            <div>
              <strong>使用 OfferTrack 标准模板</strong>
              <span>日期会统一按当天 09:00 解析，单次最多 1,000 个岗位。</span>
            </div>
            <a
              className="secondary-button import-template-link"
              download
              href={`/api/workspaces/${workspaceId}/jobs/import-template`}
            >
              下载导入模板
            </a>
          </div>
          <div
            className={`import-drop-zone${dragActive ? " is-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!busy) setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            {parsing ? (
              <>
                <span className="loading-spinner" aria-hidden="true" />
                <strong>正在解析 Excel…</strong>
                <small>{file?.name}</small>
              </>
            ) : (
              <>
                <span className="import-file-mark" aria-hidden="true">XLSX</span>
                <strong>拖拽 Excel 文件到这里</strong>
                <small>或点击下方按钮选择文件，仅支持 .xlsx，最大 5 MB</small>
              </>
            )}
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={busy} onClick={onClose} type="button">取消</button>
            <button className="primary-button" disabled={busy} onClick={openFilePicker} type="button">
              {parsing ? "正在解析…" : "选择文件"}
            </button>
          </div>
        </>
      ) : null}

      {step === "preview" && preview ? (
        <>
          <div className="import-file-summary">
            <span>文件</span>
            <strong>{preview.fileName}</strong>
          </div>
          <div className="import-summary-grid">
            <article><span>总计</span><strong>{preview.totalRows}</strong></article>
            <article className="ready"><span>可导入</span><strong>{preview.readyRows}</strong></article>
            <article className="duplicate"><span>重复跳过</span><strong>{preview.duplicateRows}</strong></article>
            <article className={preview.errorRows ? "error" : ""}><span>错误</span><strong>{preview.errorRows}</strong></article>
            <article><span>Timeline</span><strong>{preview.timelineEventCount}</strong></article>
          </div>
          {preview.generatedAppliedDates ? (
            <p className="import-info-note">
              {preview.generatedAppliedDates} 个岗位未填写投递日期，将使用导入当天 09:00。
            </p>
          ) : null}
          {preview.errorRows ? (
            <p className="import-error-note" role="alert">
              发现 {preview.errorRows} 条错误，请修正 Excel 后重新上传。本次不会写入任何数据。
            </p>
          ) : null}
          {!preview.readyRows && !preview.errorRows ? (
            <p className="import-info-note">没有可导入的新岗位。</p>
          ) : null}

          <div className="import-preview-table-wrap">
            <table className="import-preview-table">
              <thead>
                <tr><th>行号</th><th>公司</th><th>岗位</th><th>最终 Stage</th><th>结果</th><th>说明</th></tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr data-status={row.status} key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{row.companyName || "未填写"}</td>
                    <td>{row.jobName || "未填写"}</td>
                    <td>{row.finalStage ? stageLabels[row.finalStage] : "—"}</td>
                    <td><span className="import-row-status">{statusLabel(row.status)}</span></td>
                    <td>
                      {row.status === "ready" ? (
                        <details className="import-row-details">
                          <summary>{row.message}</summary>
                          <ul>
                            {row.timelineEvents.map((event) => (
                              <li key={`${event.eventType}-${event.eventDate}`}>
                                <span>{timelineEventLabels[event.eventType]}</span>
                                <time dateTime={event.eventDate}>{formatEventDate(event.eventDate)}</time>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : row.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions import-dialog-actions">
            <button className="secondary-button" onClick={onClose} type="button">取消</button>
            <button className="secondary-button" onClick={openFilePicker} type="button">重新选择文件</button>
            <button
              className="primary-button"
              disabled={Boolean(preview.errorRows || !preview.readyRows)}
              onClick={() => void confirmImport()}
              type="button"
            >
              确认导入
            </button>
          </div>
        </>
      ) : null}

      {step === "importing" && preview ? (
        <div className="import-progress" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <strong>正在导入岗位…</strong>
          <p>正在创建 {preview.readyRows} 个岗位和 {preview.timelineEventCount} 条 Timeline 记录，请勿关闭窗口。</p>
        </div>
      ) : null}

      {step === "complete" && result ? (
        <>
          <div className="import-complete-mark" aria-hidden="true">✓</div>
          <div className="import-complete-summary" role="status">
            <p><span>已导入岗位</span><strong>{result.importedJobs}</strong></p>
            <p><span>已创建 Timeline</span><strong>{result.createdTimelineEvents}</strong></p>
            <p><span>已复用公司</span><strong>{result.reusedCompanies}</strong></p>
            <p><span>新建公司</span><strong>{result.createdCompanies}</strong></p>
            <p><span>重复跳过</span><strong>{result.skippedDuplicates}</strong></p>
            <p><span>自动补充投递日期</span><strong>{result.generatedAppliedDates}</strong></p>
          </div>
          <div className="dialog-actions">
            <button className="primary-button" onClick={onClose} type="button">完成</button>
          </div>
        </>
      ) : null}
    </DialogShell>
  );
}
