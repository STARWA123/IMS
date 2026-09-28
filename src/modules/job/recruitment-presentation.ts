import type { EventType, Stage } from "../../generated/prisma/client";

export const stages = [
  "APPLIED",
  "ASSESSMENT",
  "FIRST_INTERVIEW",
  "SECOND_INTERVIEW",
  "THIRD_INTERVIEW",
  "HR_INTERVIEW",
  "OFFER",
  "REJECTED",
] as const satisfies readonly Stage[];

export const eventTypes = [
  "APPLIED",
  "ASSESSMENT_COMPLETED",
  "FIRST_INTERVIEW_COMPLETED",
  "SECOND_INTERVIEW_COMPLETED",
  "THIRD_INTERVIEW_COMPLETED",
  "HR_INTERVIEW_COMPLETED",
  "OFFER_RECEIVED",
  "REJECTED",
] as const satisfies readonly EventType[];

export const stageLabels: Record<Stage, string> = {
  APPLIED: "已投递",
  ASSESSMENT: "已测评",
  FIRST_INTERVIEW: "一面",
  SECOND_INTERVIEW: "二面",
  THIRD_INTERVIEW: "三面",
  HR_INTERVIEW: "HR面",
  OFFER: "Offer",
  REJECTED: "淘汰",
};

export const timelineEventLabels: Record<EventType, string> = {
  APPLIED: "投递提交",
  ASSESSMENT_COMPLETED: "测评完成",
  FIRST_INTERVIEW_COMPLETED: "一面完成",
  SECOND_INTERVIEW_COMPLETED: "二面完成",
  THIRD_INTERVIEW_COMPLETED: "三面完成",
  HR_INTERVIEW_COMPLETED: "HR面完成",
  OFFER_RECEIVED: "Offer获得",
  REJECTED: "淘汰",
};
