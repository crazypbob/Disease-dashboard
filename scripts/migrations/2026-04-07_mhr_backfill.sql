-- MHR backfill (Mycoplasma hyorhinis)
-- 목표: 과거에 disease='MH'로 들어간 hyorhinis 케이스를 disease='MHR'로 정리
-- 안전: 트랜잭션 + 변경 전/후 카운트 확인

BEGIN;

-- 1) 변경 후보 수(사전)
SELECT
  COUNT(*) AS mh_pcr_total,
  SUM(CASE WHEN COALESCE(details,'') ILIKE '%hyorhinis%' OR COALESCE(details,'') ILIKE '%하이오라이니스%' OR COALESCE(details,'') ILIKE '%m. hyorhinis%' THEN 1 ELSE 0 END) AS mh_hyorhinis_in_details,
  SUM(CASE WHEN COALESCE(method,'') ILIKE '%hyorhinis%' OR COALESCE(method,'') ILIKE '%하이오라이니스%' OR COALESCE(method,'') ILIKE '%m. hyorhinis%' THEN 1 ELSE 0 END) AS mh_hyorhinis_in_method,
  SUM(CASE WHEN COALESCE(pdf_file_id,'') ILIKE '%hyorhinis%' OR COALESCE(pdf_file_id,'') ILIKE '%하이오라이니스%' OR COALESCE(pdf_file_id,'') ILIKE '%m. hyorhinis%' THEN 1 ELSE 0 END) AS mh_hyorhinis_in_pdf
FROM test_records
WHERE disease = 'MH'
  AND (test_type ILIKE '%PCR%' OR test_type ILIKE '%AG%' OR test_type ILIKE '%항원%');

-- 2) backfill: hyorhinis → MHR (hyopneumoniae는 유지)
UPDATE test_records
SET disease = 'MHR'
WHERE disease = 'MH'
  AND (test_type ILIKE '%PCR%' OR test_type ILIKE '%AG%' OR test_type ILIKE '%항원%')
  AND (
    COALESCE(details,'') ILIKE '%hyorhinis%' OR COALESCE(details,'') ILIKE '%하이오라이니스%' OR COALESCE(details,'') ILIKE '%m. hyorhinis%'
    OR COALESCE(method,'') ILIKE '%hyorhinis%' OR COALESCE(method,'') ILIKE '%하이오라이니스%' OR COALESCE(method,'') ILIKE '%m. hyorhinis%'
    OR COALESCE(pdf_file_id,'') ILIKE '%hyorhinis%' OR COALESCE(pdf_file_id,'') ILIKE '%하이오라이니스%' OR COALESCE(pdf_file_id,'') ILIKE '%m. hyorhinis%'
  )
  AND NOT (
    COALESCE(details,'') ILIKE '%hyopneumoniae%' OR COALESCE(method,'') ILIKE '%hyopneumoniae%' OR COALESCE(pdf_file_id,'') ILIKE '%hyopneumoniae%'
  );

-- 3) 변경 후 확인
SELECT disease, test_type, COUNT(*) AS rows
FROM test_records
WHERE disease IN ('MH','MHR')
  AND (test_type ILIKE '%PCR%' OR test_type ILIKE '%AG%' OR test_type ILIKE '%항원%')
GROUP BY disease, test_type
ORDER BY disease, test_type;

-- 필요 시 ROLLBACK; 검증 후 COMMIT;
COMMIT;

