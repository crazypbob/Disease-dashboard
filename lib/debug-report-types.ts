export type DebugReportRow = {
  id: number;
  created_at: string;
  submitter_email: string;
  submitter_name: string | null;
  title: string | null;
  body_markdown: string;
  context_json: string | null;
  status: string;
  mail_sent_at: string | null;
};

export type DebugReportListItem = {
  id: number;
  created_at: string;
  submitter_email: string;
  submitter_name: string | null;
  title: string | null;
  preview: string;
  status: string;
  mail_sent_at: string | null;
};
