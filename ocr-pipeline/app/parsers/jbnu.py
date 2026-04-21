"""
전북대(jb5219) 파서
파일명 패턴 1 (신규 2025~): YYYYMMDD_{코드+농장명}({담당자}) 최종 결과 보고서_jb5219_{검사종류}.pdf
파일명 패턴 2 (구형 네스트): YYYYMMDD_접수번호_검사종류(영문)_농장명_네스트....pdf

PDF 구조:
  1페이지: 표지 (접수일자, 의뢰정보, 시료내역, 농장정보, 소견서)
  2페이지: 검사결과 테이블 (VDC 순번, 검체번호, S/P값 or 결과, 판정, 비고)

예) 20250305_2006대월(한지현) 최종 결과 보고서_jb5219_PRRS ELISA.pdf
    20240903_24-1138_PED_PCR_놀뫼농장_동물진료법인네스트.pdf
"""
import re
import logging
from pathlib import Path

import numpy as np

from .base import (
    BaseParser, format_date, _find, _extract_farm_from_ocr,
    _extract_date_from_ocr, _RESULT_MATCH, _FLEXIBLE_BETWEEN,
    strip_serum_criteria_footer,
)

log = logging.getLogger(__name__)

# ─────────────────────────────────────────
# 전북대 검사종류 매핑
# ─────────────────────────────────────────
JBNU_TEST_TYPE_MAP = {
    'PRRSV PCR':      '항원',
    'PRRS PCR':       '항원',
    'PED PCR':        '항원',
    'PEDV PCR':       '항원',
    '자돈소화기 PCR':  '항원',
    'PRRS ELISA':     '혈청',
    'ELISA':          '혈청',
    '세균 배양':       '세균',
    '세균독소 PCR':    '세균',
    '항생제내성':      '세균',
    'PCR':            '항원',
}

_JBNU_KEYWORDS = ('jb5219', '네스트', '전북대')
JBNU_OCR_KEYWORDS = ('vetdxlab', 'jbnu', 'jb5219', '전북대', '동물질병')


def _map_jbnu_test_type(raw: str) -> str:
    raw_upper = raw.strip().upper()
    for key, val in JBNU_TEST_TYPE_MAP.items():
        if key.upper() in raw_upper:
            return val
    return raw.strip()


class JbnuParser(BaseParser):

    @classmethod
    def detect(cls, filename: str) -> bool:
        s = filename.lower()
        return any(k in s for k in _JBNU_KEYWORDS)

    def get_ocr_dpi(self) -> int:
        return 400

    def is_multi_page_skip_first(self) -> bool:
        # 전북대 PDF: 양쪽 페이지 모두 읽음 (page1=메타, page2=결과)
        # 텍스트 추출 시 건너뛰지 않음. 테이블은 parse_report에서 별도 추출.
        return False

    def preprocess_image(self, image):
        """스캔본 이미지 전처리 (Tesseract OCR 정확도 향상)"""
        try:
            import cv2
            img_array = np.array(image)
            if len(img_array.shape) == 3:
                gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            else:
                gray = img_array
            denoised = cv2.medianBlur(gray, 3)
            _, binary = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            from PIL import Image
            return Image.fromarray(binary)
        except ImportError:
            return image

    def parse_filename(self, filename: str) -> dict:
        raw_name = re.sub(r'\.pdf$', '', filename, flags=re.IGNORECASE)

        # 신규 패턴
        m = re.match(
            r'^(\d{8})_(\d{4}[^\s(_（(]+)[（(][^)）]*[)）][^_]*_jb5219_(.*)',
            raw_name
        )
        if m:
            return {
                '날짜':    format_date(m.group(1)),
                '검사종류': _map_jbnu_test_type(m.group(3)),
                '접수번호': '',
                '농장명':  m.group(2).strip(),
            }

        # 구형 패턴
        m = re.match(r'^(\d{8})_(\d{2}-\d+)?_?([A-Za-z\_]+)_([^_]+)_', raw_name)
        if m:
            return {
                '날짜':    format_date(m.group(1)),
                '검사종류': _map_jbnu_test_type(m.group(3)),
                '접수번호': m.group(2) or '',
                '농장명':  m.group(4),
            }

        return {'날짜': '', '검사종류': '', '접수번호': '', '농장명': ''}

    # ─────────────────────────────────────────
    # 전북대 전용 parse_report — 테이블 기반 결과 추출
    # ─────────────────────────────────────────
    def parse_report(self, text: str, filename: str, pdf_path=None) -> dict:
        """
        전북대 PDF 파싱:
        1. 파일명에서 메타데이터 추출
        2. 텍스트(양쪽 페이지)에서 보조 정보 보완
        3. pdf_path가 있으면 pdfplumber로 페이지2 테이블 추출 → 결과 파싱
        4. 테이블 추출 실패 시 regex fallback
        """
        meta = self.parse_filename(filename)
        검사종류 = meta.get('검사종류', '')

        # ── 텍스트에서 메타 보완 ──
        # 전북대는 파일명 날짜(발송일)보다 접수일자가 “검사 날짜” 의미에 더 가까움.
        # 중간/최종이 날짜를 달리해 와도 접수일자로 통일해 매트릭스 중복을 줄인다.
        if text:
            receipt_date = _extract_date_from_ocr(text)
            if receipt_date:
                meta['날짜'] = receipt_date

        if not meta.get('농장명') and text:
            farm = _extract_farm_from_ocr(text)
            if farm:
                meta['농장명'] = farm

        # 텍스트에서 검사종류 감지 (염기/유전자는 PRRS ELISA 문구보다 우선)
        if not 검사종류 and text:
            if re.search(
                r'염기서열|염기서\s*열분석|유전자\s*분석|서열\s*분석|q?PCR\s*염기',
                text,
                re.I,
            ):
                검사종류 = '염기서열분석'
            elif re.search(r'항원\s*검사|PRRSV?\s*항원', text, re.I):
                검사종류 = '항원'
            elif re.search(r'항체\s*검사|PRRS\s*ELISA|PRRSV?\s*항체', text, re.I):
                검사종류 = '혈청'
            elif re.search(r'세균', text):
                검사종류 = '세균'
            if 검사종류:
                meta['검사종류'] = 검사종류

        # ── 페이지1에서 추가 메타데이터 추출 ──
        # 접수번호, 농장정보가 텍스트에 있을 수 있음
        if text and not meta.get('접수번호'):
            m = re.search(r'접수번호\s*[：:]\s*(\d{2}-\d+)', text)
            if m:
                meta['접수번호'] = m.group(1)

        # 농장정보: "3016남도 (박지효)" 형식에서 추출
        if text and not meta.get('농장명'):
            m = re.search(r'농장정보\s*[：:\s]+\s*(\d{4}[^\s(]+)', text)
            if m:
                meta['농장명'] = m.group(1).strip()

        # ── 테이블 기반 결과 추출 (핵심) ──
        detail = {}
        table_extracted = False

        if pdf_path:
            try:
                from ocr import extract_tables_from_pdf
                # 페이지 2 (0-indexed: 1)에서 테이블 추출
                tables = extract_tables_from_pdf(Path(pdf_path), page_indices=[1])
                if tables:
                    detail = self._parse_jbnu_tables(tables, 검사종류, filename, text or '')
                    table_extracted = bool(detail)
                    if table_extracted:
                        log.info(f"[TABLE] 테이블 추출 성공: {filename}")
            except Exception as e:
                log.warning(f"[TABLE] 테이블 추출 실패, regex fallback: {filename}: {e}")

        # ── regex fallback ──
        if not table_extracted:
            combined_text = filename + "\n" + text
            detail = self._parse_jbnu_text(combined_text, 검사종류, filename)

        return {
            # import 단계에서 pdf_file_id를 안정적으로 만들 수 있도록 "원본 파일명"을 별도 컬럼으로 제공
            # (표시용 파일명은 길어도 무방. 필요하면 UI에서 줄여서 표시)
            '파일명': filename,
            'PDF_파일ID': filename,
            **meta,
            'OCR_미리보기': text[:100].replace('\n', ' ') if text else '',
            **detail,
        }

    def extract_titer_rows(self, parsed_row: dict, filename: str, pdf_path=None) -> list:
        sp_blob = str(parsed_row.get('S/P_VALUES') or parsed_row.get('PRRS_S/P') or '').strip()
        targets_blob = str(parsed_row.get('S/P_TARGETS') or 'PRRS').strip()
        if not sp_blob:
            return []

        farm_raw = str(parsed_row.get('농장명') or '').strip()
        m = re.search(r'(\d{4})$', farm_raw)
        farm_code = m.group(1) if m else ''
        test_date = str(parsed_row.get('날짜') or '').strip()
        if not farm_code or not test_date:
            return []

        vals = []
        for part in sp_blob.split(','):
            s = part.strip()
            if not s:
                continue
            try:
                vals.append(float(s))
            except Exception:
                pass

        targets = [t.strip().upper() for t in targets_blob.split(',') if t.strip()]
        if not targets:
            targets = ['PRRS']

        pdf_file_id = str(parsed_row.get('PDF_파일ID') or parsed_row.get('파일명') or filename)
        out = []
        for disease in targets:
            for i, v in enumerate(vals, start=1):
                out.append({
                    'farm_code': farm_code,
                    'test_date': test_date,
                    'disease': disease,
                    'animal_no': i,
                    'sp_value': v,
                    'age_days': None,
                    'age_range': None,
                    'parity_group': None,
                    'source_file': filename,
                    'pdf_file_id': pdf_file_id,
                    'needs_review': True,
                })
        return out

    def _parse_jbnu_tables(self, tables: list, 검사종류: str, filename: str, hint_text: str = '') -> dict:
        """
        pdfplumber 테이블 데이터에서 결과 추출.

        전북대 결과 테이블 구조:
        - 혈청(ELISA): [VDC 순번, 검체번호, S/P값, 판정, 비고]
        - 항원(PCR):   [VDC 순번, 검체번호, 결과(NA), 결과(EU), 비고] 또는 유사
        - 세균:        [순번, 검체, 세균수, 대장균수, 검출균, 비고]
        """
        if '혈청' in 검사종류:
            return self._parse_serum_table(tables, filename, hint_text)
        elif '항원' in 검사종류:
            # 파일명에 질병이 안 들어가는 경우가 있어, 페이지 텍스트도 힌트로 사용
            return self._parse_antigen_table(tables, filename, hint_text)
        elif '세균' in 검사종류:
            return self._parse_bacteria_table(tables)
        return {}

    def _find_col_index(self, header_row: list, keywords: list) -> int:
        """헤더 행에서 키워드를 포함한 열 인덱스 찾기"""
        for i, cell in enumerate(header_row):
            cell_lower = (cell or '').lower().strip()
            for kw in keywords:
                if kw in cell_lower:
                    return i
        return -1

    @staticmethod
    def _is_plausible_prrs_sp_ratio(v: float) -> bool:
        """
        PRRS ELISA S/P ratio 가정 범위. 개체번호 일부(예: 80-506 → 잘못 잡힌 80) 등 배제.
        APP 흉막폐렴(S/P Value % 등)은 스케일이 달라 별도 테이블/타깃에서 필터하지 않는다.
        """
        return -1.0 <= v <= 10.0

    @staticmethod
    def _aggregate_prrs_elisa(sp_values: list) -> str:
        """
        PRRS 항체(ELISA) S/P 기준:
        - 하나라도 >= 0.4 → 양성
        - 그 외 하나라도 0.3 <= v < 0.4 → 의심
        - 모두 < 0.3 → 음성
        """
        if not sp_values:
            return ''
        vals = [float(v) for v in sp_values]
        if any(v >= 0.4 for v in vals):
            return '양성'
        if any(0.3 <= v < 0.4 for v in vals):
            return '의심'
        return '음성'

    @staticmethod
    def _normalize_judge_cell(cell: str) -> str:
        """
        판정 열 한 칸을 양성/음성/의심으로 정규화.
        '양성판정기준' 등 참조 문구는 집계에서 제외(부분 문자열 '양성' 오인 방지).
        """
        t = (cell or '').strip()
        if not t:
            return ''
        if '판정기준' in t or '양성판정' in t:
            return ''
        if t in ('양성', '음성', '의심'):
            return t
        m = re.search(r'(?:^|[\s,;])(양성|음성|의심)(?:$|[\s,;])', t)
        if m:
            return m.group(1)
        return ''

    @staticmethod
    def _aggregate_judgements(judgements: list[str]) -> str:
        """판정 열 기준 집계: 양성 > 의심 > 음성 (행별 정규화 후, 부분 문자열 매칭 없음)"""
        tokens: list[str] = []
        for x in judgements:
            tok = JbnuParser._normalize_judge_cell(str(x))
            if tok:
                tokens.append(tok)
        if not tokens:
            return ''
        if '양성' in tokens:
            return '양성'
        if '의심' in tokens:
            return '의심'
        if '음성' in tokens:
            return '음성'
        return ''

    def _serum_targets_from_filename_and_text(self, filename: str, hint_text: str = '') -> list[str]:
        """전북대 ELISA: 파일명·본문으로 항체 타깃(PRRS / APP / MH) 결정."""
        s = (filename or '').lower()
        ht = hint_text or ''
        if 'mh elisa' in s:
            return ['MH']
        # 한글+영문 혼합/대소문자/공백 변형을 허용
        if ('호흡기' in (filename or '') and 'elisa' in s) or ('호흡기elisa' in s) or ('resp' in s):
            # 호흡기 ELISA: APP(흉막폐렴) + MH 항체
            return ['APP', 'MH']
        if '호흡기' in ht and 'elisa' in ht.lower():
            return ['APP', 'MH']

        # 파일명은 PRRS ELISA만 있어도, 시료/검사항목에 PRRS+APP+MH 항체가 함께 기재된 복합 검사
        if self._text_suggests_combined_prrs_app_mh_elisa(ht):
            return ['PRRS', 'APP', 'MH']

        return ['PRRS']

    @staticmethod
    def _text_suggests_combined_prrs_app_mh_elisa(text: str) -> bool:
        """
        본문 앞부분에 APP·MH 항체(또는 동등 명칭)가 함께 언급되면 복합 패널로 본다.
        (파일명이 jb5219_PRRS ELISA.pdf 인 경우 기존에는 PRRS만 채워지던 이슈)
        """
        if not text or len(text.strip()) < 30:
            return False
        head = text[:8000]
        # 항체/혈청/ELISA/S·P 맥락 근처의 질병 표기
        has_app = re.search(
            r'(?:\bAPP\b|Actinobacillus\s+pleuropneumoniae|흉막\s*폐렴)[^\n]{0,160}(?:항체|혈청|ELISA|S\s*/\s*P)',
            head,
            re.I,
        ) or re.search(
            r'(?:항체|혈청|ELISA)[^\n]{0,120}(?:\bAPP\b|흉막\s*폐렴)',
            head,
            re.I,
        )
        has_mh = re.search(
            r'(?:\bMH\b|Mycoplasma\s+hyopneumoniae|마이코플라즈마)[^\n]{0,160}(?:항체|혈청|ELISA|S\s*/\s*P)',
            head,
            re.I,
        ) or re.search(
            r'(?:항체|혈청|ELISA)[^\n]{0,120}(?:\bMH\b|hyopneumoniae|마이코)',
            head,
            re.I,
        )
        return bool(has_app and has_mh)

    def _parse_serum_table(self, tables: list, filename: str = '', hint_text: str = '') -> dict:
        """
        혈청(ELISA) 테이블 파싱
        헤더: VDC 순번 | 검체번호 | S/P값 | 판정 | 비고
        → 기본은 ‘판정’ 열로만 집계(양성/의심/음성). 판정 미해독 시에만 S/P 숫자로 폴백.
        """
        sp_values = []
        judgments = []
        remarks = []

        targets_hint = self._serum_targets_from_filename_and_text(filename, hint_text)
        prrs_only = targets_hint == ['PRRS']

        for table in tables:
            if len(table) < 2:
                continue

            header = table[0]
            sp_col = self._find_col_index(header, ['s/p', 'sp값', 's/p값'])
            judge_col = self._find_col_index(header, ['판정'])
            remark_col = self._find_col_index(header, ['비고'])

            if sp_col < 0 and judge_col < 0:
                # 헤더를 못 찾으면 위치 기반 추정 (3열=S/P, 4열=판정)
                if len(header) >= 4:
                    sp_col, judge_col = 2, 3
                    remark_col = 4 if len(header) >= 5 else -1

            for row in table[1:]:
                if sp_col >= 0 and sp_col < len(row):
                    val = (row[sp_col] or '').strip()
                    if val and re.match(r'^-?[\d.]+$', val):
                        fv = float(val)
                        if prrs_only and not self._is_plausible_prrs_sp_ratio(fv):
                            continue
                        sp_values.append(fv)

                if judge_col >= 0 and judge_col < len(row):
                    j = (row[judge_col] or '').strip()
                    if j:
                        judgments.append(j)

                if remark_col >= 0 and remark_col < len(row):
                    r = (row[remark_col] or '').strip()
                    if r:
                        remarks.append(r)

        result = {}
        agg_by_j = self._aggregate_judgements(judgments)
        used_fallback = False
        agg = agg_by_j
        if not agg and sp_values:
            # 판정 열을 못 읽은 경우에만 S/P로 폴백
            agg = self._aggregate_prrs_elisa(sp_values)
            used_fallback = True

        targets = self._serum_targets_from_filename_and_text(filename, hint_text)
        if agg:
            if 'PRRS' in targets:
                result['PRRS_항체'] = agg
            if 'MH' in targets:
                result['MH_항체'] = agg
            if 'APP' in targets:
                result['APP_항체'] = agg
            result['판정'] = agg

        if used_fallback:
            result['PRRS_S/P'] = ', '.join(f'{v:.3f}' for v in sp_values) if sp_values else ''
            result['판정_출처'] = 'S/P'
            result['판정_미해독'] = '1'
        else:
            result['판정_출처'] = '판정'
            result['판정_미해독'] = '0'

        # 항체가(표본) 저장용: 판정열을 읽었더라도 S/P 원시값은 별도로 제공한다.
        # - downstream에서 antibody_titers에 (animal_no, sp_value)로 적재 가능
        # - 호흡기 ELISA 등 타깃이 여러 개인 경우도 원시값은 동일 테이블에서 추출된 값으로 유지
        result['S/P_VALUES'] = ', '.join(f'{v:.3f}' for v in sp_values) if sp_values else ''
        result['S/P_TARGETS'] = ','.join(self._serum_targets_from_filename_and_text(filename, hint_text))
        if not used_fallback and sp_values:
            result['PRRS_S/P'] = result['S/P_VALUES']

        if remarks:
            result['비고'] = '; '.join(remarks)

        return result

    @staticmethod
    def _antigen_target_from_filename_or_text(filename: str, hint_text: str = '') -> str:
        """
        항원(PCR) 결과가 어떤 질병 컬럼으로 들어가야 하는지 결정.
        - 결과 엑셀 컬럼명과 import 매핑(DISEASE_COLUMNS)에 맞춰 *_결과 키를 사용한다.
        """
        s = (filename or '').lower()
        t = (hint_text or '').lower()
        if 'ped' in s and 'pcv' not in s:
            return 'PED_결과'
        if 'tge' in s:
            return 'TGE_결과'
        if 'mh' in s:
            return 'MH_결과'
        if 'app' in s:
            return 'APP_결과'
        if (
            'siv' in s
            or 'iav' in s
            or 'influenza' in s
            or 'siv' in t
            or 'iav' in t
            or 'influenza' in t
            or ('인플루' in (filename or ''))
            or ('인플루' in (hint_text or ''))
        ):
            return 'SIV_결과'
        # default: PRRSV PCR
        return 'PRRS_결과'

    def _parse_antigen_table(self, tables: list, filename: str = '', hint_text: str = '') -> dict:
        """
        항원(PCR) 테이블 파싱
        가능한 헤더:
        - [VDC 순번, 검체번호, 결과(NA), 결과(EU), 비고]
        - [순번, 검체, 결과, 비고]
        """
        results_na = []
        results_eu = []
        results_general = []
        remarks = []

        for table in tables:
            if len(table) < 2:
                continue

            header = table[0]
            na_col = self._find_col_index(header, ['na', '결과(na)', 'na)'])
            eu_col = self._find_col_index(header, ['eu', '결과(eu)', 'eu)'])
            result_col = self._find_col_index(header, ['결과'])
            remark_col = self._find_col_index(header, ['비고'])

            # 결과(NA)/결과(EU) 개별 열인 경우
            if na_col >= 0 or eu_col >= 0:
                for row in table[1:]:
                    if na_col >= 0 and na_col < len(row):
                        v = (row[na_col] or '').strip()
                        if v:
                            results_na.append(v)
                    if eu_col >= 0 and eu_col < len(row):
                        v = (row[eu_col] or '').strip()
                        if v:
                            results_eu.append(v)
                    if remark_col >= 0 and remark_col < len(row):
                        r = (row[remark_col] or '').strip()
                        if r:
                            remarks.append(r)
            elif result_col >= 0:
                # 단일 결과 열
                for row in table[1:]:
                    if result_col < len(row):
                        v = (row[result_col] or '').strip()
                        if v:
                            results_general.append(v)
                    if remark_col >= 0 and remark_col < len(row):
                        r = (row[remark_col] or '').strip()
                        if r:
                            remarks.append(r)

        result = {}

        # 파일명으로 어떤 질병인지 결정 (전북대는 항원 결과표가 보통 단일 질병)
        target_key = self._antigen_target_from_filename_or_text(filename, hint_text)

        all_results = results_na + results_eu + results_general
        if all_results:
            has_positive = any(r in ('양성', '검출', 'Positive') for r in all_results)
            result[target_key] = '양성' if has_positive else '음성'

        if remarks:
            result['비고'] = '; '.join(remarks)

        return result

    def _parse_bacteria_table(self, tables: list) -> dict:
        """세균 테이블 파싱"""
        bacteria_counts = []
        ecoli_counts = []
        detected = []

        for table in tables:
            if len(table) < 2:
                continue

            header = table[0]
            bacteria_col = self._find_col_index(header, ['세균수', '세균'])
            ecoli_col = self._find_col_index(header, ['대장균'])
            detected_col = self._find_col_index(header, ['검출균', '검출'])

            for row in table[1:]:
                if bacteria_col >= 0 and bacteria_col < len(row):
                    v = (row[bacteria_col] or '').strip()
                    if v:
                        bacteria_counts.append(v)
                if ecoli_col >= 0 and ecoli_col < len(row):
                    v = (row[ecoli_col] or '').strip()
                    if v:
                        ecoli_counts.append(v)
                if detected_col >= 0 and detected_col < len(row):
                    v = (row[detected_col] or '').strip()
                    if v:
                        detected.append(v)

        result = {}
        if bacteria_counts:
            result['세균수'] = ', '.join(bacteria_counts)
        if ecoli_counts:
            result['대장균수'] = ', '.join(ecoli_counts)
        if detected:
            result['검출균'] = ', '.join(detected)
        return result

    # ─────────────────────────────────────────
    # Regex fallback (테이블 추출 실패 시)
    # ─────────────────────────────────────────
    def _parse_jbnu_text(self, text: str, 검사종류: str, filename: str = '') -> dict:
        """테이블 추출 실패 시 regex로 결과 추출 (fallback)"""
        if '항원' in 검사종류:
            return self._parse_antigen_text(text)
        elif '혈청' in 검사종류:
            return self._parse_serum_text(text, filename)
        elif '세균' in 검사종류:
            return self._parse_bacteria_text(text)
        return {'추출결과_오류': text[:100]}

    def _parse_antigen_text(self, text: str) -> dict:
        """항원 regex fallback"""
        prrs = ''
        # 전북대 (NA)/(EU) 형식
        m = re.search(r'결과\s*[\(\[\{]?[NE][AU][\)\]\}]?[^\n]*(양성|검출|음성|불검출)', text, re.I)
        if m:
            prrs = m.group(1).strip()
        if not prrs:
            m = re.search(rf'PRRS{_FLEXIBLE_BETWEEN}{_RESULT_MATCH}', text, re.I)
            if m:
                prrs = m.group(1).strip()

        return {
            'PRRS_결과': prrs,
            'PED_결과': _find(rf'PED(?![V]){_FLEXIBLE_BETWEEN}{_RESULT_MATCH}', text),
            'PEDV_결과': _find(rf'PEDV{_FLEXIBLE_BETWEEN}{_RESULT_MATCH}', text),
            'TGE_결과': _find(rf'TGE{_FLEXIBLE_BETWEEN}{_RESULT_MATCH}', text),
            'SIV_결과': _find(rf'(SIV|IAV|INFLUENZA|인플루){_FLEXIBLE_BETWEEN}{_RESULT_MATCH}', text),
            '비고': _find(r'비고[：:]\s*([^\n]+)', text),
        }

    def _parse_serum_text(self, text: str, filename: str = '') -> dict:
        """혈청 regex fallback (테이블 추출 실패 시). 하단 양성판정기준 등은 제거 후 판정."""
        text = strip_serum_criteria_footer(text or '')
        sp_raw = re.findall(r'(-?\d+\.\d+)', text)
        sp_floats = []
        for s in sp_raw[:20]:
            try:
                sp_floats.append(float(s))
            except ValueError:
                pass
        sp_str = ', '.join(f'{v:.3f}' for v in sp_floats) if sp_floats else ''

        agg = self._aggregate_prrs_elisa(sp_floats) if sp_floats else ''
        if not agg:
            line_tokens: list[str] = []
            for line in text.splitlines():
                ln = line.strip()
                if not ln or '판정기준' in ln:
                    continue
                if '평균' in ln:
                    continue
                m_pair = re.search(r'(-?\d+\.\d+)\s+(양성|음성|의심)', ln)
                if m_pair:
                    line_tokens.append(m_pair.group(2))
                    continue
                tok = self._normalize_judge_cell(ln)
                if tok:
                    line_tokens.append(tok)
            agg = self._aggregate_judgements(line_tokens)

        targets = self._serum_targets_from_filename_and_text(filename, text)
        out: dict = {
            '판정': agg,
            '비고': _find(r'비고[：:]\s*([^\n]+)', text),
        }
        if sp_floats:
            out['S/P_VALUES'] = ', '.join(f'{v:.3f}' for v in sp_floats)
            out['S/P_TARGETS'] = ','.join(targets)
        if sp_str:
            out['PRRS_S/P'] = sp_str

        if agg:
            if 'PRRS' in targets:
                out['PRRS_항체'] = agg
            if 'MH' in targets:
                out['MH_항체'] = agg
            if 'APP' in targets:
                out['APP_항체'] = agg
        elif sp_str:
            if 'PRRS' in targets:
                out['PRRS_항체'] = sp_str
            if 'MH' in targets:
                out['MH_항체'] = sp_str
            if 'APP' in targets:
                out['APP_항체'] = sp_str

        return out

    def _parse_bacteria_text(self, text: str) -> dict:
        """세균 regex fallback"""
        return {
            '세균수': _find(r'세균수[^\n]*?([\d,]+)', text),
            '대장균수': _find(r'대장균[^\n]*?([\d,]+)', text),
            '검출균': _find(r'검출[^\n]*?[：:]\s*([^\n]+)', text),
            '비고': _find(r'비고[：:]\s*([^\n]+)', text),
        }
