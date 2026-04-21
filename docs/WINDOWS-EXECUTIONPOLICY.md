# Windows PowerShell ExecutionPolicy 이슈 (npm.ps1 / npx.ps1 차단) 대응

## 증상

PowerShell에서 아래와 비슷한 오류가 나면, **스크립트 실행 정책** 때문에 `npm.ps1` 또는 `npx.ps1`이 차단된 것입니다.

- `npm.ps1 파일을 로드할 수 없습니다` / `PSSecurityException`
- `npx.ps1` 관련 동일 오류

`npm.com`은 Node에 없는 명령입니다. **`npm.cmd`** 를 쓰세요.

---

## 즉시 해결(권장): `.cmd`로 강제

PowerShell에서 **`npm` 대신 `npm.cmd`**, **`npx` 대신 `npx.cmd`** 를 입력합니다.

```powershell
cd X:\질병메일링_대시보드\disease-dashboard
npm.cmd run dev
```

다른 스크립트도 동일합니다.

```powershell
npm.cmd run import:ocr -- --file="X:/ocr-pipeline/output/results.xlsx" --replace
npm.cmd run verify:matrix-report
```

`npm.cmd`는 보통 `C:\Program Files\nodejs\npm.cmd`에 있습니다.

---

## 대안

### Command Prompt(cmd.exe) 사용

`cmd`에서 `npm run dev`는 기본적으로 `.cmd` 쪽으로 가서 같은 문제가 나지 않는 경우가 많습니다.

### 정책 변경(선택)

회사 정책이 허용하면 현재 사용자만 완화할 수 있습니다.

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

이후 일반 `npm run dev`도 동작할 수 있습니다.

---

## import 등 Node 스크립트(참고)

`npm.cmd`가 어렵면 프로젝트 안의 실행 파일을 직접 호출할 수 있습니다.

```powershell
.\node_modules\.bin\tsx.cmd scripts\import-ocr-results.ts --file="..." --replace
```

---

## 이 프로젝트에서의 운영 표준

- **PowerShell**: 가능하면 **`npm.cmd run …`** 를 기본으로 둡니다.
- **문서·예시에 `npm run`만 적힌 경우**에도, PowerShell에서 막히면 위와 같이 `npm.cmd`로 바꿉니다.
