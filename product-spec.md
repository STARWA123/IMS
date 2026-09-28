# OfferTrack Product Specification

## 1. Product Overview

Product Name: OfferTrack

Product Type: Personal recruitment process management system.

Goal: Manage different recruitment cycles, track job application
progress, record recruitment timeline changes, and analyze recruitment
outcomes.

Core concept:

Workspace manages recruitment periods. Kanban manages recruitment
stages. Timeline records process history. Dashboard analyzes recruitment
data.

------------------------------------------------------------------------

# 2. Product Scope

## Included in V1

-   Workspace management
-   Job management
-   Kanban recruitment board
-   Drag and drop stage updates
-   Timeline records
-   Dashboard statistics
-   Search and filtering
-   Excel import with data preview
-   Excel export
-   Local database backup and restore

## Not included in V1

-   User login
-   AI analysis
-   JD parsing
-   Resume management
-   Interview recording analysis
-   Email synchronization
-   Reminder system
-   Mobile application

------------------------------------------------------------------------

# 3. Information Architecture

    OfferTrack

    ├── Workspace
    │
    ├── Dashboard
    │
    ├── Kanban
    │
    ├── Job List
    │
    ├── Job Detail
    │
    └── Settings

------------------------------------------------------------------------

# 4. Workspace

Workspace represents an independent recruitment cycle.

Examples:

-   2027秋招
-   2027春招
-   Other

Different workspaces have isolated data.

## Default behavior

First launch automatically creates:

"My Workspace"

Users can:

-   Create workspace
-   Rename workspace
-   Switch workspace
-   Delete workspace

## Delete Rule

Workspace deletion requires confirmation.

Deleting a workspace removes:

Workspace → Company → Job → TimelineEvent

------------------------------------------------------------------------

# 5. Data Model

Core entities:

    Workspace

    Company

    Job

    TimelineEvent

Relationship:

    Workspace
        |
        └── Company
                |
                └── Job
                        |
                        └── TimelineEvent

------------------------------------------------------------------------

# 6. Job Model

Job is the core management object.

Fields:

-   Company
-   Job Name
-   Base Location
-   Job URL
-   Stage
-   Status (legacy internal compatibility field; not user-facing)
-   Remark
-   Created Time
-   Updated Time

------------------------------------------------------------------------

# 7. Recruitment Stage

Stage determines the Kanban column and represents the latest recruitment
milestone completed by the job.

Enum:

    APPLIED
    ASSESSMENT
    FIRST_INTERVIEW
    SECOND_INTERVIEW
    THIRD_INTERVIEW
    HR_INTERVIEW
    OFFER
    REJECTED

Display:

    已投递
    已测评
    一面
    二面
    三面
    HR面
    Offer
    淘汰

------------------------------------------------------------------------

# 8. Legacy Status

Status remains in the database for backward compatibility with existing
SQLite data and backups. It is not displayed in the product, is not exported,
and does not determine the user-facing recruitment workflow. Stage is the
single source of truth shown to users.

Enum:

    PENDING
    COMPLETED
    FAILED

Rules:

-   Existing Status values are retained internally for compatibility.
-   Product behavior must not depend on users viewing or editing Status.
-   Offer stage is limited to one offer per company.

------------------------------------------------------------------------

# 9. Kanban Board

Layout:

Horizontal stage columns.

    已投递 | 已测评 | 一面 | 二面 | 三面 | HR面 | Offer | 淘汰

Every column represents a completed recruitment milestone.

Card display:

-   Company Name
-   Job Name
-   Base Location
-   Job Link (when available)
-   Updated Time

Card sorting:

updatedAt descending.

Supported:

-   Search by company
-   Search by job name
-   Search by base location

------------------------------------------------------------------------

# 10. Drag and Drop

Cards support cross-stage movement.

Example:

    一面 → 二面

After dragging:

-   Update Job.stage
-   The destination column represents a completed milestone
-   Always create the corresponding TimelineEvent

User confirmation required.

------------------------------------------------------------------------

# 11. Timeline

Timeline records recruitment history.

Event types:

    投递提交

    测评完成

    一面完成

    二面完成

    三面完成

    HR面完成

    Offer获得

    淘汰

Timeline supports:

-   Automatic creation
-   Manual creation
-   Edit
-   Delete

Rules:

Creating a job automatically creates:

投递提交

Stage changes automatically create related timeline events.

------------------------------------------------------------------------

# 12. Dashboard

Statistics only apply to current Workspace.

Metrics:

## Company Count

Number of companies.

## Job Count

Number of jobs.

## Interview Entry Rate

Formula:

进入一面的岗位数量 / 投递岗位数量

## Offer Count

Number of offer jobs.

## Offer Company Conversion Rate

Formula:

Offer company count / Applied company count

------------------------------------------------------------------------

# 13. Dashboard Additional Information

Display:

## Recruitment Funnel

    投递
     ↓
    一面
     ↓
    二面
     ↓
    Offer

## Process Duration

Calculate:

-   Application to first interview
-   First interview to second interview
-   Second interview to offer

Based on Timeline data.

## Recent Activity

Display latest timeline updates.

------------------------------------------------------------------------

# 14. Job List

Job list supports:

Display:

-   Company
-   Job
-   Base
-   Stage
-   Updated Time

The action area displays an Open Link action when the job has a URL.

Sorting:

Updated time descending.

Search:

-   Company name
-   Job name
-   Base location

------------------------------------------------------------------------

# 15. Excel Import

The Job List toolbar provides an Import Excel action for the current
Workspace. Import never writes data to another Workspace.

Only `.xlsx` files are supported. A file can contain at most 1,000 data rows
and cannot exceed 5 MB.

The standard template contains:

-   Company Name (required)
-   Job Name (required)
-   Base Location
-   Job URL
-   Remark
-   Applied Completion Date
-   Assessment Completion Date
-   First Interview Completion Date
-   Second Interview Completion Date
-   Third Interview Completion Date
-   HR Interview Completion Date
-   Offer Received Date
-   Process Termination Date

Import rules:

-   Blank Base Location is stored as `未填写`.
-   Blank Applied Completion Date uses the import date at 09:00.
-   All supplied dates are normalized to 09:00 in Asia/Shanghai.
-   Supplied dates must follow chronological order. Process Termination Date
    cannot be earlier than any completed milestone.
-   Sparse intermediate milestones are allowed. Only supplied milestones create
    TimelineEvent records, except that APPLIED is always created.
-   Job.stage is the highest supplied completed milestone. Process Termination
    overrides it with REJECTED.
-   A job with the same exact Company Name and Job Name in the current Workspace
    is skipped. Existing data is never overwritten.
-   The one-offer-per-company rule is enforced during preview and import.

The user must preview the parsed result before confirmation. Preview shows ready,
duplicate, and error rows, plus the Timeline events that will be created. Any
error row blocks the complete import. Duplicate rows are skipped and do not block
the import. Confirmed writes execute in one database transaction, so a failed
import leaves no partial data.

------------------------------------------------------------------------

# 16. Export

Support Excel export.

Export current Workspace.

Excel contains:

## Sheet 1: Jobs

Fields:

-   Company
-   Job
-   Base
-   Stage
-   URL
-   Remark
-   Updated Time

## Sheet 2: Timeline

Fields:

-   Company
-   Job
-   Event
-   Date
-   Remark

------------------------------------------------------------------------

# 17. Backup

Settings page provides:

-   Export backup
-   Restore backup

Backup includes local SQLite database.

------------------------------------------------------------------------

# 18. UI Design

Style:

-   Linear
-   Notion
-   Apple

Keywords:

-   Simple
-   Professional
-   Technology-oriented

Colors:

Primary:

#2563EB

Background:

#F8FAFC

Card:

#FFFFFF

Success:

#22C55E

Danger:

#EF4444

------------------------------------------------------------------------

# 19. Development Rules

-   Keep architecture simple.
-   Maintain strict TypeScript.
-   Do not add features outside this specification without confirmation.
-   Maintain local-first data storage.
-   Preserve all business logic defined above.
