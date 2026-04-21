/** 매트릭스/지도 탭 옆에 붙는 지도 모드 안내 (FarmMapPanel 상단 중복 방지) */
export function MapViewTabHint() {
  return (
    <p className="min-w-0 max-w-3xl flex-1 text-[11px] leading-snug text-zinc-500 lg:max-w-none">
      다비 시설은 <strong className="text-zinc-600">DB 코드</strong>만 표시(팝업에 주소·농장명 없음). 정부·농장주는 행안부{' '}
      <strong className="text-zinc-600">전국 돼지(축산일련번호)</strong> 레이어. 반경·가상 양성은{' '}
      <strong className="text-amber-800">데모</strong>. 정부에서 <strong className="text-red-800">ASF</strong> 선택 시 전국 가상
      발생 지점(30) 레이어. 공수의는 마커 클릭 후 반경 설정. 필터 버튼은{' '}
      <strong className="text-zinc-600">줌 유지</strong>.
    </p>
  );
}
