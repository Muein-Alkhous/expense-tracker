export type InsightKind = "insight" | "alert";

export interface Insight {
  id: string;
  kind: InsightKind;
  rule: string;
  messageKey: string;
  params: Record<string, string | number>;
}
