/**
 * results.xlsx → DB import (관리자 전용)
 * OCR 파이프라인 output 폴더의 result.xlsx / results.xlsx를 DB에 반영
 *
 * POST /api/admin/import-ocr
 * POST /api/admin/import-ocr?replace=0   (--replace 생략: 삽입만, 기존 행 유지)
 * POST /api/admin/import-ocr?format=single-column  (전북대 A열 형식)
 *
 * 기본: `--replace` 포함 (동일 pdf·검사 UPDATE). 서버가 읽는 xlsx는 findXlsxPath() 순서
 * (OCR_OUTPUT_PATH → 프로젝트 ocr-pipeline/output/ → scripts/results.xlsx).
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? process.env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  if (ADMIN_EMAILS.length === 0) return true;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

function findXlsxPath(): string | null {
  const cwd = process.cwd();
  const outputPath = process.env.OCR_OUTPUT_PATH?.trim();
  const candidates: string[] = [];

  if (outputPath) {
    candidates.push(path.join(outputPath, 'result.xlsx'));
    candidates.push(path.join(outputPath, 'results.xlsx'));
    candidates.push(outputPath);
  }

  candidates.push(path.join(cwd, 'ocr-pipeline', 'output', 'result.xlsx'));
  candidates.push(path.join(cwd, 'ocr-pipeline', 'output', 'results.xlsx'));
  candidates.push(path.join(cwd, 'scripts', 'results.xlsx'));

  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return p;
    }
  }
  return null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const xlsxPath = findXlsxPath();
  if (!xlsxPath) {
    return NextResponse.json(
      {
        error:
          'results.xlsx를 찾을 수 없습니다. ocr-pipeline/output/ 또는 OCR_OUTPUT_PATH를 확인하세요.',
      },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(req.url);
  const formatParam = searchParams.get('format');
  /** 기본 true: 관리자 버튼은 ?replace=1. 명시적으로 replace=0 으로 끌 수 있음 */
  const replaceParam = searchParams.get('replace');
  const replaceOff = replaceParam === '0' || replaceParam === 'false';
  const args = ['scripts/import-ocr-results.ts', `--file=${xlsxPath}`];
  if (formatParam === 'single-column') {
    args.push('--format=single-column');
  }
  if (!replaceOff && (replaceParam === null || replaceParam === '1' || replaceParam === 'true')) {
    args.push('--replace');
  }

  const nodeDir = path.dirname(process.execPath);
  const isWin = process.platform === 'win32';
  const tsxBin = path.join(process.cwd(), 'node_modules', '.bin', isWin ? 'tsx.cmd' : 'tsx');
  const exe = fs.existsSync(tsxBin) ? tsxBin : path.join(nodeDir, isWin ? 'npx.cmd' : 'npx');
  const spawnArgs = exe === tsxBin ? args : ['tsx', ...args];

  const env = { ...process.env };
  env.PATH = [nodeDir, env.PATH].filter(Boolean).join(path.delimiter);

  try {
    const result = spawnSync(
      exe,
      spawnArgs,
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
        /** 대량 import는 여전히 수 분~수십 분 걸릴 수 있음. 초과 시 CLI 권장 */
        timeout: 1_800_000,
        maxBuffer: 1024 * 1024,
        shell: isWin,
        env,
      }
    );

    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';

    if (result.status !== 0) {
      throw new Error(stderr || result.error?.message || `exit code ${result.status}`);
    }

    const ins = stdout.match(/(\d+)\s*건\s*삽입/);
    const upd = stdout.match(/(\d+)\s*건\s*업데이트/);
    const skp = stdout.match(/(\d+)\s*건\s*스킵/);
    const inserted = ins ? parseInt(ins[1], 10) : 0;
    const updated = upd ? parseInt(upd[1], 10) : 0;
    const skipped = skp ? parseInt(skp[1], 10) : 0;

    return NextResponse.json({
      ok: true,
      inserted,
      updated,
      skipped,
      message: `DB 반영 완료: ${inserted}건 삽입, ${updated}건 업데이트, ${skipped}건 스킵`,
    });
  } catch (e) {
    const err = e as Error;
    console.error('[admin import-ocr]', err);
    return NextResponse.json(
      {
        error: err.message || 'Import 실패',
      },
      { status: 500 }
    );
  }
}
