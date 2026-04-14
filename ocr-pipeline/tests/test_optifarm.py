"""
옵티팜 파서 단위 테스트
파일명 파싱 + 결과 추출 검증
"""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'app'))

from parsers.optifarm import OptifarmParser
from parsers.base import parse_antigen, parse_serum, strip_serum_criteria_footer


class TestOptifarmDetect(unittest.TestCase):
    """OptifarmParser.detect: 옵티팜 파일 감지"""

    def test_detect_optifarm(self):
        self.assertTrue(OptifarmParser.detect("20260320_(항원) 26-00009 놀뫼농장.pdf"))

    def test_not_detect_jbnu(self):
        self.assertFalse(OptifarmParser.detect("20250305_2006대월(한지현) 최종 결과 보고서_jb5219_PRRS ELISA.pdf"))

    def test_not_detect_nest(self):
        self.assertFalse(OptifarmParser.detect("20240903_24-1138_PED_PCR_놀뫼농장_동물진료법인네스트.pdf"))


class TestOptifarmParseFilename(unittest.TestCase):
    """OptifarmParser.parse_filename: 파일명에서 메타데이터 추출"""

    def setUp(self):
        self.parser = OptifarmParser()

    def test_standard_format(self):
        """옵티팜: YYYYMMDD_(검사종류) 접수번호 농장명.pdf"""
        meta = self.parser.parse_filename("20260320_(항원) 26-00009 놀뫼농장.pdf")
        self.assertEqual(meta["날짜"], "2026-03-20")
        self.assertEqual(meta["검사종류"], "항원")
        self.assertEqual(meta["접수번호"], "26-00009")
        self.assertEqual(meta["농장명"], "놀뫼농장")

    def test_no_date_prefix(self):
        """날짜 없는 형식 (항원) 26-01957 다비연구소.pdf"""
        meta = self.parser.parse_filename("(항원) 26-01957 다비연구소.pdf")
        self.assertEqual(meta["검사종류"], "항원")
        self.assertEqual(meta["접수번호"], "26-01957")
        self.assertEqual(meta["농장명"], "다비연구소")

    def test_serum_format(self):
        """혈청 형식"""
        meta = self.parser.parse_filename("20260320_(혈청) 26-00010 성진농장.pdf")
        self.assertEqual(meta["검사종류"], "혈청")
        self.assertEqual(meta["농장명"], "성진농장")

    def test_long_mail_filename_prefers_tail_hyocheong(self):
        """메일/동기화로 앞부분이 길어도 끝 `(혈청) 접수번호 농장`을 검사 메타로 쓴다."""
        fn = (
            "20260410_[옵티팜] 성진종돈 - 호흡기질병혈청검사결과서입니다._=_euc-kr_x_= "
            "_user_(혈청) 26-03697 성진종돈.pdf"
        )
        meta = self.parser.parse_filename(fn)
        self.assertEqual(meta["날짜"], "2026-04-10")
        self.assertEqual(meta["검사종류"], "혈청")
        self.assertEqual(meta["접수번호"], "26-03697")
        self.assertEqual(meta["농장명"], "성진종돈")


class TestOptifarmParseReport(unittest.TestCase):
    """OptifarmParser.parse_report: 통합 파싱"""

    def setUp(self):
        self.parser = OptifarmParser()

    def test_antigen_report(self):
        filename = "20260320_(항원) 26-00009 놀뫼농장.pdf"
        text = "PRRSV 항원 1 음성\nPED 결과 양성"
        row = self.parser.parse_report(text, filename)
        self.assertEqual(row["날짜"], "2026-03-20")
        self.assertEqual(row["농장명"], "놀뫼농장")
        self.assertEqual(row["PRRS_결과"], "음성")
        self.assertEqual(row["PED_결과"], "양성")

    def test_bacteria_antibiotic_susceptibility_report_marks_v(self):
        filename = "20260404_(세균) 26-01234 대덕종돈.pdf"
        text = """
        세균 검사 결과서
        접수일자 2026년 4월 4일
        농장정보 대덕종돈
        약제 내성 검사 결과
        * NT: not tested
        [결과해석] S (Sensitive) : 효과 있음, I (Intermediate) : 효과 중간, R (Resistant) : 효과 없음
        Amoxicillin(AML25) R
        Gentamicin(CN10) S
        """
        row = self.parser.parse_report(text, filename)
        self.assertEqual(row["날짜"], "2026-04-04")
        self.assertEqual(row["농장명"], "대덕종돈")
        self.assertEqual(row.get("항생제_감수성"), "V")

    def test_long_filename_truncated(self):
        """50자 초과 파일명 → ... 로 간략화"""
        filename = "a" * 60 + ".pdf"
        row = self.parser.parse_report("", filename)
        self.assertEqual(len(row["파일명"]), 53)
        self.assertTrue(row["파일명"].endswith("..."))


class TestParseAntigenShared(unittest.TestCase):
    """공유 parse_antigen: PCR 결과 추출"""

    def test_negative(self):
        r = parse_antigen("PRRSV 항원 1 음성")
        self.assertEqual(r["PRRS_결과"], "음성")

    def test_positive(self):
        r = parse_antigen("PED 결과 양성")
        self.assertEqual(r["PED_결과"], "양성")

    def test_detected(self):
        r = parse_antigen("PRRSV 항원 1 검출")
        self.assertEqual(r["PRRS_결과"], "검출")

    def test_not_detected(self):
        r = parse_antigen("TGE 결과 불검출")
        self.assertEqual(r["TGE_결과"], "불검출")

    def test_combined(self):
        text = "PRRSV 항원 1 음성 PEDV 항원 음성"
        r = parse_antigen(text)
        self.assertEqual(r["PRRS_결과"], "음성")
        self.assertEqual(r["PEDV_결과"], "음성")


class TestOptifarmSerumCriteriaFooter(unittest.TestCase):
    """양성판정기준의 0.4가 PRRS 항체 첫 숫자로 잡히는 케이스 (공용 parse_serum)"""

    def test_criteria_0_4_can_mislead_parse_serum(self):
        # 'PRRS' 직후 OCR 블록에 양성판정기준 줄이 먼저 오면 첫 실수가 0.4가 될 수 있음
        text = "항목 PRRS돼지\n양성판정기준 S/P ratio 0.4 이상\n80-506 0.00 음성"
        raw = parse_serum(text).get("PRRS_항체") or ""
        self.assertTrue(raw.startswith("0.4"), msg=f"unexpected PRRS_항체={raw!r}")

    def test_strip_footer_removes_threshold_line(self):
        text = "항목 PRRS돼지\n양성판정기준 S/P ratio 0.4 이상\n80-506 0.00 음성"
        stripped = strip_serum_criteria_footer(text)
        self.assertNotIn("0.4", stripped)
        raw = parse_serum(stripped).get("PRRS_항체") or ""
        self.assertFalse(raw.startswith("0.4"))


class TestOptifarmPrrsTableAggregation(unittest.TestCase):
    """PDF 테이블 기반 PRRS 항체 (옵티팜 혈청)"""

    def setUp(self):
        self.parser = OptifarmParser()

    def test_prrs_table_all_negative_judgement(self):
        tables = [
            [
                ["개체 구분", "S/P ratio", "결과 판독"],
                ["80-506", "0.00", "음성"],
                ["80-509", "0.02", "음성"],
                ["평균", "0.00", "0%"],
            ]
        ]
        fake_pdf = Path("/nonexistent/optifarm.pdf")
        with patch.object(self.parser, "_extract_pdf_tables", return_value=tables):
            got = self.parser._prrs_serum_from_pdf_tables(fake_pdf)
        self.assertEqual(got.get("PRRS_항체"), "음성")
        self.assertEqual(got.get("판정_출처"), "판정")

    def test_parse_report_uses_table_over_regex(self):
        filename = "20260320_(혈청) 26-00010 테스트농장.pdf"
        ocr_text = "PRRS\n양성판정기준 S/P ratio 0.4 이상"
        tables = [
            [
                ["개체 구분", "S/P ratio", "결과 판독"],
                ["x", "0.00", "음성"],
            ]
        ]
        fake_pdf = Path("/nonexistent/x.pdf")
        with patch.object(self.parser, "_extract_pdf_tables", return_value=tables):
            row = self.parser.parse_report(ocr_text, filename, pdf_path=fake_pdf)
        self.assertEqual(row.get("PRRS_항체"), "음성")


if __name__ == "__main__":
    unittest.main(verbosity=2)
