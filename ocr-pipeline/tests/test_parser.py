"""
parser.py shim 호환 테스트
기존 인터페이스(parse_report, parse_filename)가 새 parsers/ 패키지와 동일하게 동작하는지 검증
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'app'))

from parser import parse_filename, parse_report


class TestShimParseFilename(unittest.TestCase):

    def test_optifarm(self):
        meta = parse_filename("20260320_(항원) 26-00009 놀뫼농장.pdf")
        self.assertEqual(meta["날짜"], "2026-03-20")
        self.assertEqual(meta["검사종류"], "항원")

    def test_jbnu(self):
        meta = parse_filename("20250305_2006대월(한지현) 최종 결과 보고서_jb5219_PRRS ELISA.pdf")
        self.assertEqual(meta["검사종류"], "혈청")
        self.assertEqual(meta["농장명"], "2006대월")

    def test_nest(self):
        meta = parse_filename("20240903_24-1138_PED_PCR_놀뫼농장_동물진료법인네스트.pdf")
        self.assertEqual(meta["검사종류"], "항원")
        self.assertEqual(meta["농장명"], "놀뫼농장")


class TestShimParseReport(unittest.TestCase):

    def test_optifarm_report(self):
        row = parse_report("PRRSV 항원 1 음성", "20260320_(항원) 26-00009 놀뫼농장.pdf")
        self.assertEqual(row["PRRS_결과"], "음성")

    def test_jbnu_report_with_pdf_path(self):
        """pdf_path 파라미터 전달 가능한지 확인"""
        filename = "20250305_3001조산(김광일) 최종 결과 보고서_jb5219_PRRSV PCR.pdf"
        row = parse_report("결과 (NA) 음성", filename, pdf_path=None)
        self.assertEqual(row["검사종류"], "항원")
        self.assertEqual(row["PRRS_결과"], "음성")


if __name__ == "__main__":
    unittest.main(verbosity=2)
