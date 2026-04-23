export type AccessRequestRow = {
  id: number;
  email: string;
  display_name: string | null;
  note: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolver_email: string | null;
};
