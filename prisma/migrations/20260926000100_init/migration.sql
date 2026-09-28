-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Company_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "baseLocation" TEXT NOT NULL,
    "jobUrl" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'APPLIED'
        CHECK ("stage" IN (
            'APPLIED',
            'ASSESSMENT',
            'FIRST_INTERVIEW',
            'SECOND_INTERVIEW',
            'THIRD_INTERVIEW',
            'HR_INTERVIEW',
            'OFFER',
            'REJECTED'
        )),
    "status" TEXT NOT NULL DEFAULT 'PENDING'
        CHECK ("status" IN ('PENDING', 'COMPLETED', 'FAILED')),
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_companyId_workspaceId_fkey"
        FOREIGN KEY ("companyId", "workspaceId")
        REFERENCES "Company" ("id", "workspaceId")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL
        CHECK ("eventType" IN (
            'APPLIED',
            'ASSESSMENT_COMPLETED',
            'FIRST_INTERVIEW_COMPLETED',
            'SECOND_INTERVIEW_COMPLETED',
            'THIRD_INTERVIEW_COMPLETED',
            'HR_INTERVIEW_COMPLETED',
            'OFFER_RECEIVED',
            'REJECTED'
        )),
    "eventDate" DATETIME NOT NULL,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimelineEvent_jobId_fkey"
        FOREIGN KEY ("jobId") REFERENCES "Job" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Workspace_updatedAt_idx" ON "Workspace"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Company_id_workspaceId_key" ON "Company"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "Company_workspaceId_name_idx" ON "Company"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "Job_workspaceId_updatedAt_idx" ON "Job"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "Job_companyId_idx" ON "Job"("companyId");

-- CreateIndex
CREATE INDEX "Job_stage_idx" ON "Job"("stage");

-- Product rule: only one job per company may currently be in OFFER.
CREATE UNIQUE INDEX "Job_one_offer_per_company_key"
ON "Job"("companyId") WHERE "stage" = 'OFFER';

-- CreateIndex
CREATE INDEX "TimelineEvent_jobId_eventDate_idx" ON "TimelineEvent"("jobId", "eventDate");

-- CreateIndex
CREATE INDEX "TimelineEvent_eventDate_idx" ON "TimelineEvent"("eventDate");
