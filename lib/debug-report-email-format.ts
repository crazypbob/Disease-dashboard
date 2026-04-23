/** 매트릭스 검증 리포트 메일 — 제목·본문 고정 블록(Gmail 덤프·스크립트 파싱용). */

export const DEBUG_VERIFY_SUBJECT_TAG = '[DiseaseDashboard:Verify]';

export function buildDebugVerifySubject(id: number, title: string | null | undefined): string {
  const tail = (title?.trim() || `매트릭스 검증 #${id}`).slice(0, 200);
  return `${DEBUG_VERIFY_SUBJECT_TAG} #${id} ${tail}`.trim();
}

/** 이메일 본문 하단 — 줄 단위 키로 파싱 가능 */
export function buildDebugVerifyMachineFooter(input: {
  reportId: number;
  submitterEmail: string;
  submitterName: string | null;
}): string {
  const name = (input.submitterName ?? '').trim() || '(none)';
  return [
    '',
    '---disease_dashboard_verify---',
    `report_id: ${input.reportId}`,
    `submitter_email: ${input.submitterEmail}`,
    `submitter_name: ${name}`,
    '---end_disease_dashboard_verify---',
  ].join('\n');
}
