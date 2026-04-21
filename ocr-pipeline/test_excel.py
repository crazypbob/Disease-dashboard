"""
test_excel.py — results.xlsx 디버깅/샘플 확인용

용도: 전북대(네스트) 관련 행의 파일명·OCR 미리보기 출력.
     파서 동작 검증이 아님. 파서 단위 테스트는 tests/test_parser.py 참조.
"""
import openpyxl

wb = openpyxl.load_workbook('x:/ocr-pipeline/output/results.xlsx')
sheet = wb.active

# 농장명(E)이나 파일명(A)에 '네스트' 또는 '전북대'가 들어간 첫 번째 행 텍스트 찾기
print("=== 전북대(네스트) 샘플 텍스트 ===")
count = 0
for row in sheet.iter_rows(min_row=2, values_only=True):
    filename = str(row[0])
    ocr_text = str(row[5])  # F열: OCR_텍스트_미리보기
    
    if '네스트' in filename or '전북대' in filename or 'PED_PCR' in filename:
        print(f"[{filename}]")
        print(ocr_text[:800])  # 앞부분 800자
        print("-" * 50)
        count += 1
        if count >= 2:
            break
