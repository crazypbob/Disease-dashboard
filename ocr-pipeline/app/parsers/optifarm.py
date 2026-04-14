"""
옵티팜(Optifarm) 파서
파일명 패턴: YYYYMMDD_(검사종류) 접수번호 농장명.pdf
예) 20260320_(항원) 26-00009 놀뫼농장.pdf
"""
import re
from pathlib import Path

from .base import BaseParser, format_date, parse_serum, strip_serum_criteria_footer
from .jbnu import JbnuParser

_OPTIFARM_WITH_DATE = re.compile(
    r'(\d{8})'                       # 날짜 YYYYMMDD
    r'[_\s]*'
    r'[\(\（]?([^）\)\_]+)[\)\）]?'   # 검사종류 (항원, 혈청, 세균, 염기서열분석 등)
    r'[\s\_]+'
    r'(\d{2}-\d+)'                   # 접수번호 26-00009
    r'[\s\_]+'
    r'([^\.]+)',                     # 농장명
    re.IGNORECASE
)

_OPTIFARM_NO_DATE = re.compile(
    r'[\(\（]?([^）\)\_]+)[\)\）]?'   # 검사종류
    r'[\s\_]+'
    r'(\d{2}-\d+)'                   # 접수번호
    r'[\s\_]+'
    r'([^\.]+)',                     # 농장명
    re.IGNORECASE
)

# 메일·드라이브 동기화 등으로 파일명 앞부분이 매우 길어질 때,
# 끝부분 `_(혈청) 26-xxxxx 농장명.pdf` 패턴이 실제 검사 메타이므로 이걸 우선한다.
_MAIL_STYLE_TAIL = re.compile(
    r'\((혈청|항원|세균|염기서열분석)\)\s*(\d{2}-\d+)\s+(.+?)(?:\.pdf)\s*$',
    re.IGNORECASE,
)


def _meta_from_mail_style_tail(filename: str):
    m = _MAIL_STYLE_TAIL.search(filename)
    if not m:
        return None
    farm = m.group(3).strip()
    farm = farm.split('_')[0].split(' ')[0]
    date = ''
    dm = re.match(r'^(\d{8})', filename)
    if dm:
        date = format_date(dm.group(1))
    return {
        '날짜': date,
        '검사종류': m.group(1).strip(),
        '접수번호': m.group(2).strip(),
        '농장명': farm,
    }


class OptifarmParser(BaseParser):

    @classmethod
    def detect(cls, filename: str) -> bool:
        """전북대 키워드가 없는 파일 → 옵티팜으로 판단"""
        s = filename.lower()
        return not any(k in s for k in ('jb5219', '네스트', '전북대'))

    def parse_filename(self, filename: str) -> dict:
        mail = _meta_from_mail_style_tail(filename)

        m = _OPTIFARM_WITH_DATE.search(filename)
        if m:
            date = format_date(m.group(1))
            farm = m.group(4).strip()
            # 긴 쓰레기 텍스트가 농장명에 붙어있는 경우 잘라내기
            farm = farm.split('_')[0].split(' ')[0]
            kind = m.group(2).strip()
            # 앞부분만 보면 `[옵티팜]...` 처럼 잘못 잡히는 경우 → 끝 `(혈청)` 패턴 우선
            if mail and (len(kind) > 15 or '[' in kind or '옵티팜' in kind):
                return {
                    '날짜': date or mail['날짜'],
                    '검사종류': mail['검사종류'],
                    '접수번호': mail['접수번호'],
                    '농장명': mail['농장명'],
                }
            return {
                '날짜':    date,
                '검사종류': kind,
                '접수번호': m.group(3).strip(),
                '농장명':  farm,
            }

        # YYYYMMDD_(표준) 패턴이 긴 파일명에서 깨지면 WITH_DATE가 None → 아래 NO_DATE가
        # 문자열 앞쪽 잘못된 ( )만 잡을 수 있음. 끝 `(혈청) 접수 농장`이 있으면 그걸 우선.
        if mail:
            dm = re.match(r'^(\d{8})', filename)
            date_prefix = format_date(dm.group(1)) if dm else ''
            return {
                '날짜': date_prefix or mail['날짜'],
                '검사종류': mail['검사종류'],
                '접수번호': mail['접수번호'],
                '농장명': mail['농장명'],
            }

        m = _OPTIFARM_NO_DATE.search(filename)
        if m:
            farm = m.group(3).strip()
            farm = farm.split('_')[0].split(' ')[0]
            return {
                '날짜': '',
                '검사종류': m.group(1).strip(),
                '접수번호': m.group(2).strip(),
                '농장명': farm,
            }

        return {'날짜': '', '검사종류': '', '접수번호': '', '농장명': ''}

    def _extract_pdf_tables(self, pdf_path: Path) -> list:
        """pdfplumber 테이블 추출. 단위 테스트에서 패치 가능하도록 메서드로 둔다."""
        try:
            from ocr import extract_tables_from_pdf
            return extract_tables_from_pdf(pdf_path)
        except Exception:
            return []

    @staticmethod
    def _header_norm(s: str) -> str:
        return re.sub(r'\s+', '', (s or '')).lower()

    @classmethod
    def _find_header_col(cls, header_row: list, keywords: tuple[str, ...]) -> int:
        for i, cell in enumerate(header_row or []):
            n = cls._header_norm(cell)
            for kw in keywords:
                if kw in n:
                    return i
        return -1

    @staticmethod
    def _table_looks_like_optifarm_prrs_serum(joined: str) -> bool:
        """헤더 행을 norm·join한 문자열. PRRS 글자가 없어도 개체+S/P+판독이면 혈청 PRRS 표로 본다."""
        if 'app' in joined and 'mh' in joined and ('s/pratio' in joined or 'spratio' in joined):
            return False
        has_sp = 's/pratio' in joined or 'spratio' in joined
        if not has_sp:
            return False
        prrs_like = (
            ('개체' in joined or '검체' in joined)
            and ('판독' in joined or '판정' in joined or '결과' in joined)
        )
        return ('prrs' in joined) or prrs_like

    def _prrs_serum_from_pdf_tables(self, pdf_path: Path) -> dict:
        """
        pdfplumber 테이블에서 PRRS + S/P 표만 사용해 항체 판정(전북대와 동일 집계 규칙).
        하단 참조표(양성판정기준)는 헤더 패턴이 달라 여기서 제외된다.
        """
        tables = self._extract_pdf_tables(pdf_path)
        out: dict = {}
        for table in tables or []:
            if len(table) < 2:
                continue
            raw_header = [str(x or '') for x in (table[0] or [])]
            normed = [self._header_norm(x) for x in raw_header]
            joined = '|'.join(normed)
            if not self._table_looks_like_optifarm_prrs_serum(joined):
                continue

            sp_col = self._find_header_col(raw_header, ('s/pratio', 'spratio', 's/p'))
            if sp_col < 0:
                sp_col = 1 if len(raw_header) > 1 else -1
            judge_col = self._find_header_col(raw_header, ('결과판독', '판독', '판정', '결과'))

            sp_values: list[float] = []
            judgments: list[str] = []

            for row in table[1:]:
                if not row:
                    continue
                label = (row[0] or '').strip()
                if not label or '평균' in label:
                    continue
                if sp_col >= 0 and sp_col < len(row):
                    val = (row[sp_col] or '').strip()
                    if val and re.match(r'^-?[\d.]+$', val):
                        fv = float(val)
                        # PRRS S/P ratio만 범위 검사 (APP 흉막폐렴 % 등은 다른 스케일 → 이 경로에 넣지 않음)
                        if JbnuParser._is_plausible_prrs_sp_ratio(fv):
                            sp_values.append(fv)
                if judge_col >= 0 and judge_col < len(row):
                    j = (row[judge_col] or '').strip()
                    if j:
                        judgments.append(j)

            if not sp_values and not judgments:
                continue

            agg_j = JbnuParser._aggregate_judgements(judgments)
            used_fallback = False
            agg = agg_j
            if not agg and sp_values:
                agg = JbnuParser._aggregate_prrs_elisa(sp_values)
                used_fallback = True

            if not agg:
                continue

            out['PRRS_항체'] = agg
            out['판정_출처'] = 'S/P' if used_fallback else '판정'
            out['판정_미해독'] = '1' if used_fallback else '0'
            if used_fallback and sp_values:
                out['PRRS_S/P'] = ', '.join(f'{v:.3f}' for v in sp_values)
            return out

        return out

    @staticmethod
    def _looks_like_optifarm_antibiotic_susceptibility(text: str) -> bool:
        """
        옵티팜 '세균 검사 결과서' 중 항생제(약제) 감수성/내성 결과지 여부만 감지.
        이 양식은 양성/음성 판정이 아니라, 결과표(S/I/R/NT)가 존재하는지 자체가 핵심이다.
        """
        t = (text or '').replace('\r', '\n')
        n = re.sub(r'\s+', '', t).lower()
        # 제목/섹션 키워드
        if '세균검사결과서' in n and ('약제내성검사결과' in n or '항생제내성검사' in n or '감수성검사' in n):
            return True
        # 표 하단 legend (S/I/R) 패턴은 OCR에서도 비교적 잘 남는다.
        if ('s(sensitive)' in n or 'sensitive' in n) and ('r(resistant)' in n or 'resistant' in n):
            if '약제' in n or 'antibiotic' in n:
                return True
        # 약제명 컬럼 단서
        if '약제명' in n and ('amoxicillin' in n or 'gentamicin' in n or 'tetracycline' in n):
            return True
        return False

    def parse_report(self, text: str, filename: str, pdf_path=None) -> dict:
        row = super().parse_report(text, filename, pdf_path=pdf_path)
        검사종류 = str(row.get('검사종류') or '')
        # (1) 세균 결과서 + 항생제 감수성(내성) 표: 결과지 존재만 매트릭스에 표시
        if '세균' in 검사종류 or self._looks_like_optifarm_antibiotic_susceptibility(text):
            row['항생제_감수성'] = 'V'
            return row

        # (2) 혈청 결과서: PRRS ELISA 등 기존 로직
        if '혈청' not in 검사종류:
            return row

        if pdf_path:
            tbl = self._prrs_serum_from_pdf_tables(Path(pdf_path))
            if tbl.get('PRRS_항체'):
                row['PRRS_항체'] = tbl['PRRS_항체']
                row['판정_출처'] = tbl.get('판정_출처', '테이블')
                row['판정_미해독'] = tbl.get('판정_미해독', '0')
                if tbl.get('PRRS_S/P'):
                    row['PRRS_S/P'] = tbl['PRRS_S/P']
                return row

        combined = strip_serum_criteria_footer(filename + '\n' + text)
        detail = parse_serum(combined)
        if detail.get('PRRS_항체'):
            row['PRRS_항체'] = detail['PRRS_항체']
        return row

    def extract_titer_rows(self, parsed_row: dict, filename: str, pdf_path=None) -> list:
        """
        옵티팜 혈청 결과서(테이블형)에서 항체가 표본을 추출.
        - APP/MH 같이 나오는 표 (개체구분에 '40일령-1' 등 포함)
        - PRRS 표 (개체구분에 '1산 34879' 등 산차 포함, 일령은 미기재일 수 있음)
        """
        if not pdf_path:
            return []

        # 검사종류가 혈청/ELISA/항체 문맥이 아니면 스킵
        test_kind = str(parsed_row.get('검사종류') or '').lower()
        combined = f"{filename}\n{parsed_row.get('OCR_미리보기','')}"
        if ('혈청' not in test_kind) and ('elisa' not in combined.lower()) and ('항체' not in combined):
            return []

        # 농장코드: 파일명 끝 4자리 숫자 우선, 없으면 접수번호에서 숫자 4자리(끝에서)
        farm_raw = str(parsed_row.get('농장명') or '').strip()
        m = re.search(r'(\d{4})$', farm_raw)
        farm_code = m.group(1) if m else ''
        if not farm_code:
            acc = str(parsed_row.get('접수번호') or '').strip()
            digits = re.sub(r'\D', '', acc)
            if len(digits) >= 4:
                farm_code = digits[-4:]
        test_date = str(parsed_row.get('날짜') or '').strip()
        if not farm_code or not test_date:
            return []

        tables = self._extract_pdf_tables(Path(pdf_path))
        if not tables:
            return []

        def norm(s: str) -> str:
            return re.sub(r'\s+', '', (s or '')).lower()

        def parse_age_days(label: str):
            mm = re.search(r'(\d{2,3})\s*일령', label)
            return int(mm.group(1)) if mm else None

        def parse_parity_group(label: str):
            # '후보돈', '1산', '2산', '3산', '4산' 등
            if '후보' in label:
                return '후보돈'
            m2 = re.search(r'(\d)\s*산', label)
            if m2:
                n = int(m2.group(1))
                if n >= 4:
                    return '4산이상'
                return f'{n}산'
            return None

        out = []
        pdf_file_id = str(parsed_row.get('PDF_파일ID') or parsed_row.get('파일명') or filename)

        for table in tables:
            if len(table) < 2:
                continue
            header = [norm(x) for x in (table[0] or [])]
            joined = '|'.join(header)

            # APP/MH 동시 테이블: 헤더에 app/mh, s/pvalue, s/pratio 등이 존재
            if ('app' in joined and 'mh' in joined and ('s/pvalue' in joined or 'spvalue' in joined or 's/pratio' in joined or 'spratio' in joined)):
                # 대략적 컬럼 위치 탐색
                # col0: 개체구분 / col1: APP S/P / col2: APP 결과 / col3: MH S/P / col4: MH 결과
                for row in table[1:]:
                    if not row:
                        continue
                    label = (row[0] or '').strip()
                    if not label or '평균' in label:
                        continue
                    age_days = parse_age_days(label)
                    parity_group = parse_parity_group(label)
                    # APP
                    try:
                        app_v = float(str(row[1] or '').strip())
                        out.append({
                            'farm_code': farm_code,
                            'test_date': test_date,
                            'disease': 'APP',
                            'animal_no': len(out) + 1,
                            'sp_value': app_v,
                            'age_days': age_days,
                            'age_range': None,
                            'parity_group': parity_group,
                            'source_file': filename,
                            'pdf_file_id': pdf_file_id,
                            'needs_review': age_days is None,
                        })
                    except Exception:
                        pass
                    # MH
                    try:
                        mh_v = float(str(row[3] or '').strip())
                        out.append({
                            'farm_code': farm_code,
                            'test_date': test_date,
                            'disease': 'MH',
                            'animal_no': len(out) + 1,
                            'sp_value': mh_v,
                            'age_days': age_days,
                            'age_range': None,
                            'parity_group': parity_group,
                            'source_file': filename,
                            'pdf_file_id': pdf_file_id,
                            'needs_review': age_days is None,
                        })
                    except Exception:
                        pass
                continue

            # PRRS 테이블: 헤더에 PRRS 글자가 없어도 개체+S/P+판독이면 혈청 PRRS
            if self._table_looks_like_optifarm_prrs_serum(joined):
                for row in table[1:]:
                    if not row:
                        continue
                    label = (row[0] or '').strip()
                    if not label or '평균' in label:
                        continue
                    age_days = parse_age_days(label)  # 보통 없음
                    parity_group = parse_parity_group(label)
                    try:
                        v = float(str(row[1] or '').strip())
                    except Exception:
                        continue
                    out.append({
                        'farm_code': farm_code,
                        'test_date': test_date,
                        'disease': 'PRRS',
                        'animal_no': len(out) + 1,
                        'sp_value': v,
                        'age_days': age_days,
                        'age_range': None,
                        'parity_group': parity_group,
                        'source_file': filename,
                        'pdf_file_id': pdf_file_id,
                        'needs_review': age_days is None,
                    })

        return out
