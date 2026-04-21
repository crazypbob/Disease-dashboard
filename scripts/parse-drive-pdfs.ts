/**
 * Drive 폴더 내 미처리 PDF 파싱 → DB 저장
 *
 * - 이미 parsed_files에 있는 PDF는 자동 스킵 (없는 것만 처리)
 * - 한 번 실행하면 미처리분 전부 처리 (시간 걸려도 완료까지)
 * - 다음 실행 시 새로 추가된 파일만 처리
 *
 * npx tsx scripts/parse-drive-pdfs.ts [all|신규|3월|4월...] [--delay=N]
 * - all: 전체 폴더 (과거 2년치 등, 기본값)
 * - --delay=N: PDF 간 대기 초 (기본 30, 할당량 초과 시 늘리기)
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

function parseArg(name: string, def: number): number {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match ? parseInt(match.split('=')[1], 10) || def : def;
}

async function main() {
  const { runParseDrivePdfs } = await import('../lib/run-parse-drive');
  const target = process.argv[2] || 'all';
  const delaySec = parseArg('delay', 30);
  // limit=0: 전체 처리 (제한 없음)
  const result = await runParseDrivePdfs(target, 0, delaySec, (p) => {
    if (p.success) {
      if (p.recordsCount === 0) {
        console.warn(`  [${p.index}/${p.total}] 파싱 결과 없음: ${p.name}`);
      } else {
        console.log(`  [${p.index}/${p.total}] ✓ ${p.name} → ${p.recordsCount}건`);
      }
    } else {
      console.error(`  [${p.index}/${p.total}] ✗ ${p.name}:`, p.error);
    }
  });

  if (result.toProcess === 0) {
    console.log(`PDF ${result.total}개 발견 | 이미 처리됨 ${result.skipCount}개 | 처리할 PDF 없음.`);
    return;
  }
  console.log(
    `\nPDF ${result.total}개 발견 | 이미 처리됨 ${result.skipCount}개 | 처리한 미처리 ${result.toProcess}개`
  );
  console.log(`완료: ${result.processed}개 처리, ${result.failed}개 실패`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
