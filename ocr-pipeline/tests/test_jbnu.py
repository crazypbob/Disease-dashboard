"""
전북대(jb5219) 파서 단위 테스트
신규 패턴 (2025~) + 구형 네스트 패턴 + 테이블 기반 파싱 검증
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'app'))

from parsers.jbnu import JbnuParser


class TestJbnuDetect(unittest.TestCase):
    """JbnuParser.detect: 전북대 파일 감지"""

    def test_detect_jb5219(self):
        self.assertTrue(JbnuParser.detect(
            "20250305_2006대월(한지현) 최종 결과 보고서_jb5219_PRRS ELISA.pdf"
        ))

    def test_detect_nest(self):
        self.assertTrue(JbnuParser.detect(
            "20240903_24-1138_PED_PCR_놀뫼농장_동물진료법인네스트.pdf"
        ))

    def test_detect_jeonbukdae(self):
        self.assertTrue(JbnuParser.detect("20260318_전북대_결과.pdf"))

    def test_not_detect_optifarm(self):
        self.assertFalse(JbnuParser.detect("20260320_(항원) 26-00009 놀뫼농장.pdf"))


class TestJbnuNewPattern(unittest.TestCase):
    """전북대 jb5219 신규 패턴 (2025~) 파일명 파싱"""

    def setUp(self):
        self.parser = JbnuParser()

    def test_prrs_elisa(self):
        meta = self.parser.parse_filename(
            "20250305_2006대월(한지현) 최종 결과 보고서_jb5219_PRRS ELISA.pdf"
        )
        self.assertEqual(meta["날짜"], "2025-03-05")
        self.assertEqual(meta["검사종류"], "혈청")
        self.assertEqual(meta["농장명"], "2006대월")
        self.assertEqual(meta["접수번호"], "")

    def test_prrsv_pcr(self):
        meta = self.parser.parse_filename(
            "20250305_3002삼경(김수진) 최종 결과 보고서_jb5219_PRRSV PCR.pdf"
        )
        self.assertEqual(meta["검사종류"], "항원")
        self.assertEqual(meta["농장명"], "3002삼경")

    def test_ped_pcr(self):
        meta = self.parser.parse_filename(
            "20260221_3001조산(김광일) 최종 결과 보고서_jb5219_PED PCR.pdf"
        )
        self.assertEqual(meta["검사종류"], "항원")
        self.assertEqual(meta["농장명"], "3001조산")

    def test_bacteria_culture(self):
        meta = self.parser.parse_filename(
            "20260219_2009해림(장현익) 최종 결과 보고서_jb5219_세균 배양.pdf"
        )
        self.assertEqual(meta["검사종류"], "세균")
        self.assertEqual(meta["농장명"], "2009해림")

    def test_piglet_digestive_pcr(self):
        meta = self.parser.parse_filename(
            "20260219_2009해림(장현익) 최종 결과 보고서_jb5219_자돈소화기 PCR.pdf"
        )
        self.assertEqual(meta["검사종류"], "항원")

    def test_antibiotics_resistance(self):
        meta = self.parser.parse_filename(
            "20260219_2009해림(장현익) 최종 결과 보고서_jb5219_항생제내성.pdf"
        )
        self.assertEqual(meta["검사종류"], "세균")

    def test_dot_person(self):
        meta = self.parser.parse_filename(
            "20260221_3023청주한빛(.) 최종 결과 보고서_jb5219_PRRSV PCR.pdf"
        )
        self.assertEqual(meta["농장명"], "3023청주한빛")
        self.assertEqual(meta["검사종류"], "항원")


class TestJbnuLegacyPattern(unittest.TestCase):

    def setUp(self):
        self.parser = JbnuParser()

    def test_ped_pcr(self):
        meta = self.parser.parse_filename(
            "20240903_24-1138_PED_PCR_놀뫼농장_동물진료법인네스트_긴텍스트.pdf"
        )
        self.assertEqual(meta["날짜"], "2024-09-03")
        self.assertEqual(meta["접수번호"], "24-1138")
        self.assertEqual(meta["검사종류"], "항원")
        self.assertEqual(meta["농장명"], "놀뫼농장")


# ─────────────────────────────────────────
# 테이블 기반 파싱 테스트
# ─────────────────────────────────────────
class TestJbnuSerumTable(unittest.TestCase):
    """전북대 혈청(ELISA) 테이블 파싱 — 스크린샷 기반"""

    def setUp(self):
        self.parser = JbnuParser()

    def test_parse_serum_table_basic(self):
        """PRRSV 항체 검사 결과서 테이블 (실제 스크린샷 기반)"""
        tables = [[
            ['VDC 순번', '검체번호', 'S/P값', '판정', '비고'],
            ['1', '혈액-1', '0.015', '음성', ''],
            ['2', '혈액-2', '0.002', '음성', ''],
            ['3', '혈액-3', '0.000', '음성', ''],
            ['4', '혈액-4', '-0.016', '음성', ''],
            ['5', '혈액-5', '-0.010', '음성', ''],
        ]]
        result = self.parser._parse_serum_table(tables)
        self.assertEqual(result['PRRS_항체'], '음성')
        self.assertEqual(result['판정'], '음성')
        sp_values = result['PRRS_S/P'].split(', ')
        self.assertEqual(len(sp_values), 5)

    def test_parse_serum_table_with_positive(self):
        """양성 포함된 혈청 테이블"""
        tables = [[
            ['VDC 순번', '검체번호', 'S/P값', '판정', '비고'],
            ['1', '혈액-1', '2.345', '양성', ''],
            ['2', '혈액-2', '0.010', '음성', ''],
        ]]
        result = self.parser._parse_serum_table(tables)
        self.assertEqual(result['PRRS_항체'], '양성')
        self.assertEqual(result['판정'], '양성')
        sp_values = result['PRRS_S/P'].split(', ')
        self.assertEqual(len(sp_values), 2)

    def test_parse_serum_table_equivocal(self):
        """0.3~0.4 구간 → 의심 (판정 열 비어 S/P 폴백)"""
        tables = [[
            ['VDC 순번', '검체번호', 'S/P값', '판정', '비고'],
            ['1', '혈액-1', '0.35', '', ''],
            ['2', '혈액-2', '0.10', '', ''],
        ]]
        result = self.parser._parse_serum_table(tables)
        self.assertEqual(result['PRRS_항체'], '의심')

    def test_parse_serum_table_any_positive(self):
        """여러 검체 중 하나만 >=0.4여도 양성"""
        tables = [[
            ['VDC 순번', '검체번호', 'S/P값', '판정', '비고'],
            ['1', '혈액-1', '0.50', '양성', ''],
            ['2', '혈액-2', '0.10', '음성', ''],
        ]]
        result = self.parser._parse_serum_table(tables)
        self.assertEqual(result['PRRS_항체'], '양성')

    def test_parse_serum_table_judge_column_criteria_row_not_positive(self):
        """판정 열에 '양성판정기준…' 혼입 시 부분 문자열 '양성'으로 양성 오인하지 않음"""
        tables = [[
            ['VDC 순번', '검체번호', 'S/P값', '판정', '비고'],
            ['0', '', '', '양성판정기준 S/P ratio 0.4 이상', ''],
            ['1', '혈액-1', '-0.018', '음성', ''],
            ['2', '혈액-2', '-0.011', '음성', ''],
            ['3', '혈액-3', '0.001', '음성', ''],
        ]]
        result = self.parser._parse_serum_table(
            tables,
            '20260319_4014버들(.) 최종 결과 보고서_jb5219_PRRS ELISA.pdf',
        )
        self.assertEqual(result['PRRS_항체'], '음성')
        self.assertEqual(result['판정'], '음성')


class TestJbnuAntigenTable(unittest.TestCase):
    """전북대 항원(PCR) 테이블 파싱"""

    def setUp(self):
        self.parser = JbnuParser()

    def test_parse_antigen_na_eu(self):
        """결과(NA)/결과(EU) 2열 형식"""
        tables = [[
            ['VDC 순번', '검체번호', '결과(NA)', '결과(EU)', '비고'],
            ['1', '혈액-1', '음성', '음성', ''],
            ['2', '혈액-2', '음성', '음성', ''],
        ]]
        result = self.parser._parse_antigen_table(tables)
        self.assertEqual(result['PRRS_결과'], '음성')

    def test_parse_antigen_na_eu_positive(self):
        """NA 양성인 경우"""
        tables = [[
            ['VDC 순번', '검체번호', '결과(NA)', '결과(EU)', '비고'],
            ['1', '혈액-1', '양성', '음성', ''],
        ]]
        result = self.parser._parse_antigen_table(tables)
        self.assertEqual(result['PRRS_결과'], '양성')

    def test_parse_antigen_single_result_col(self):
        """단일 결과 열"""
        tables = [[
            ['순번', '검체번호', '결과', '비고'],
            ['1', '혈액-1', '음성', ''],
            ['2', '혈액-2', '음성', ''],
        ]]
        result = self.parser._parse_antigen_table(tables)
        self.assertEqual(result['PRRS_결과'], '음성')


class TestJbnuBacteriaTable(unittest.TestCase):
    """전북대 세균 테이블 파싱"""

    def setUp(self):
        self.parser = JbnuParser()

    def test_parse_bacteria_table(self):
        tables = [[
            ['순번', '검체', '세균수', '대장균수', '검출균', '비고'],
            ['1', '분변-1', '1200', '300', 'E.coli', ''],
        ]]
        result = self.parser._parse_bacteria_table(tables)
        self.assertEqual(result['세균수'], '1200')
        self.assertEqual(result['대장균수'], '300')
        self.assertEqual(result['검출균'], 'E.coli')


class TestJbnuParseReport(unittest.TestCase):
    """전북대 통합 파싱 (파일명 + 텍스트, pdf_path 없이 regex fallback)"""

    def setUp(self):
        self.parser = JbnuParser()

    def test_antigen_regex_fallback(self):
        """pdf_path 없이 regex fallback"""
        filename = "20250305_3001조산(김광일) 최종 결과 보고서_jb5219_PRRSV PCR.pdf"
        text = "PRRSV 항원 검사 결과서\n결과 (NA) 음성\n결과 (EU) 음성"
        row = self.parser.parse_report(text, filename)
        self.assertEqual(row["날짜"], "2025-03-05")
        self.assertEqual(row["농장명"], "3001조산")
        self.assertEqual(row["검사종류"], "항원")
        self.assertEqual(row["PRRS_결과"], "음성")

    def test_serum_regex_fallback(self):
        """혈청 regex fallback — S/P값과 판정 추출"""
        filename = "20260221_2006대월(한지현) 최종 결과 보고서_jb5219_PRRS ELISA.pdf"
        text = "PRRSV 항체 검사 결과서\n접수번호 : 26-0305\n0.015 음성\n0.002 음성"
        row = self.parser.parse_report(text, filename)
        self.assertEqual(row["검사종류"], "혈청")
        self.assertEqual(row.get("PRRS_항체", ''), "음성")
        self.assertIn('0.015', row.get("PRRS_S/P", ''))
        self.assertEqual(row.get("판정", ''), "음성")

    def test_serum_regex_fallback_footer_criteria_not_positive(self):
        """하단 양성판정기준 블록이 있어도 본문 S/P·음성이 우선 (regex 폴백)"""
        filename = "20260319_4014버들(.) 최종 결과 보고서_jb5219_PRRS ELISA.pdf"
        text = (
            "PRRSV 항체 검사 결과서\n"
            "-0.018 음성\n-0.011 음성\n"
            "양성판정기준 S/P ratio 0.4 이상\n"
        )
        row = self.parser._parse_serum_text(text)
        self.assertEqual(row.get("PRRS_항체"), "음성")
        self.assertEqual(row.get("판정"), "음성")

    def test_metadata_from_text(self):
        """텍스트에서 접수번호, 농장정보 보완"""
        filename = "20260325_3016남도(박지효) 최종 결과 보고서_jb5219_PRRS ELISA.pdf"
        text = "접수번호 : 26-0305\n농장정보 : 3016남도 (박지효)\nPRRSV 항체 검사"
        row = self.parser.parse_report(text, filename)
        self.assertEqual(row["농장명"], "3016남도")

    def test_both_pages_read(self):
        """전북대는 양쪽 페이지 모두 읽어야 함"""
        # is_multi_page_skip_first가 False여야 양쪽 페이지 읽음
        self.assertFalse(self.parser.is_multi_page_skip_first())

    def test_ocr_dpi(self):
        self.assertEqual(self.parser.get_ocr_dpi(), 400)


if __name__ == "__main__":
    unittest.main(verbosity=2)
