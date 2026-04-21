# 다른 PC에서 작업 시 설치할 것

> 링크 복사해서 브라우저에서 설치.

---

## 필수

| 프로그램 | 용도 | 링크 |
|----------|------|------|
| **Node.js LTS** | npm, Next.js, tsx | https://nodejs.org/ |
| **Python 3.11+** | naver-imap, OCR 스크립트 | https://www.python.org/downloads/ |
| **Git** | 버전 관리 | https://git-scm.com/download/win |
| **Cursor** 또는 **VS Code** | 에디터 | https://cursor.com/ 또는 https://code.visualstudio.com/ |

---

## OCR·자동화 (선택)

| 프로그램 | 용도 | 링크 |
|----------|------|------|
| **Docker Desktop** | OCR 파이프라인, n8n | https://www.docker.com/products/docker-desktop/ |

---

## 설치 후 (한 번만)

```powershell
cd X:\질병메일링_대시보드\disease-dashboard

# 1) 의존성 설치
npm install

# 2) Python 패키지 (naver 스크립트용)
pip install python-dotenv

# 3) .env.local 복사 (다른 PC에서 동일 설정 사용 시)
#    기존 PC의 .env.local 내용을 복사해 새 PC 프로젝트 루트에 저장

# 4) 실행
npm run dev
```

- **접속**: http://localhost:3005
- **상세**: `SETUP.md` 참고
