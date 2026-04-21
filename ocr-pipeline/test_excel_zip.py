"""
test_excel_zip.py — results.xlsx 디버깅/샘플 확인용

용도: OCR 파이프라인 출력 results.xlsx의 sharedStrings.xml에서
     '네스트', '전북대', '접수일자'가 포함된 긴 텍스트 샘플 2건을 출력.
     파서 동작 검증이 아님. 파서 단위 테스트는 tests/test_parser.py 참조.

실행: python test_excel_zip.py
      (results.xlsx 경로가 x:/ocr-pipeline/output/ 가정)
"""
import zipfile
import xml.etree.ElementTree as ET


def read_xlsx_strings(filepath):
    # .xlsx 파일은 ZIP 아카이브입니다.
    with zipfile.ZipFile(filepath, 'r') as z:
        # 1. sharedStrings.xml 파싱 (엑셀의 모든 문자열 데이터 저장소)
        with z.open('xl/sharedStrings.xml') as f:
            tree = ET.parse(f)
            root = tree.getroot()
            # 네임스페이스 처리 우회
            ns = root.tag.split('}')[0] + '}' if '}' in root.tag else ''
            
            strings = []
            for t in root.iter(f'{ns}t'):
                if t.text:
                    strings.append(t.text)
            
            # 2. '네스트(다비)' 또는 '전북대'가 포함된 매우 긴 텍스트 찾기
            found = 0
            for s in strings:
                if '네스트' in s or '전북대' in s or '접수일자' in s:
                    if len(s) > 100:  # 미리보기 열에 해당하는 긴 텍스트
                        print("="*60)
                        print("찾은 샘플 텍스트:")
                        print("="*60)
                        print(s)
                        print("\n\n")
                        found += 1
                        if found >= 2:
                            break

if __name__ == '__main__':
    read_xlsx_strings('x:/ocr-pipeline/output/results.xlsx')
