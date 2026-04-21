# NAS 자동 파이프라인 스케줄러 퀵스타트

권장 운영은 `scripts/nas-auto-pipeline.py`를 **5분마다 주기 실행**하는 방식입니다.

자세한 운영 문서: `docs/OPS-AUTOMATION.md`

## 1) Linux/NAS (crontab)

레포 루트에서 실행되도록 등록합니다.

```cron
*/5 * * * * cd /volume1/docker/질병메일링_대시보드/disease-dashboard && /usr/bin/python3 scripts/nas-auto-pipeline.py >> /var/log/nas-auto-pipeline.log 2>&1
```

또는 래퍼 사용:

```cron
*/5 * * * * /bin/bash /volume1/docker/질병메일링_대시보드/disease-dashboard/scripts/run-nas-auto-pipeline.sh >> /var/log/nas-auto-pipeline.log 2>&1
```

## 2) Windows 작업 스케줄러(상시 PC)

- **프로그램/스크립트**: `powershell`
- **인수 추가**:

```text
-NoProfile -ExecutionPolicy Bypass -File X:\질병메일링_대시보드\disease-dashboard\scripts\run-nas-auto-pipeline.ps1
```

- **트리거**: 5분마다 반복

