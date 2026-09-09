@echo off
setlocal EnableExtensions DisableDelayedExpansion

REM Signed solver-worker environment validator. This script never provisions,
REM persists, prints, or tests a database credential or HMAC secret, and it does
REM not launch PioSOLVER. See scripts\WINDOWS_DEPLOYMENT.txt before proceeding.

if /I "%~1"=="M1" (
  set "SP_MACHINE_ID=M1"
  set "SP_PARTITION_INDEX=0"
) else if /I "%~1"=="M2" (
  set "SP_MACHINE_ID=M2"
  set "SP_PARTITION_INDEX=1"
) else (
  echo Usage: scripts\windows-setup.bat M1 ^| M2
  exit /b 2
)

python --version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Python 3 is required and must be on PATH.
  exit /b 1
)

REM A solver box with any legacy database setting is intentionally unsafe.
if defined SUPABASE_SERVICE_ROLE_KEY goto :legacy_database_setting
if defined SUPABASE_SERVICE_KEY goto :legacy_database_setting
if defined SUPABASE_KEY goto :legacy_database_setting
if defined SUPABASE_URL goto :legacy_database_setting
if defined SUPABASE_ANON_KEY goto :legacy_database_setting
if defined NEXT_PUBLIC_SUPABASE_URL goto :legacy_database_setting
if defined NEXT_PUBLIC_SUPABASE_ANON_KEY goto :legacy_database_setting
if defined SUPABASE_DB_URL goto :legacy_database_setting
if defined SUPABASE_CONNECTION_POOL_URL goto :legacy_database_setting
if defined SUPABASE_DB_HOST goto :legacy_database_setting
if defined SUPABASE_DB_PORT goto :legacy_database_setting
if defined SUPABASE_DB_USER goto :legacy_database_setting
if defined SUPABASE_DB_PASSWORD goto :legacy_database_setting
if defined SUPABASE_DB_NAME goto :legacy_database_setting
if defined SUPABASE_DB_SSL goto :legacy_database_setting
if defined SUPABASE_DB_CA goto :legacy_database_setting
if defined SUPABASE_JWT_SECRET goto :legacy_database_setting
if defined SUPABASE_PROJECT_REF goto :legacy_database_setting
if defined NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY goto :legacy_database_setting
if defined VITE_SUPABASE_URL goto :legacy_database_setting
if defined VITE_SUPABASE_ANON_KEY goto :legacy_database_setting
if defined FALLBACK_SUPABASE_URL goto :legacy_database_setting
if defined SUPABASE_URL_FALLBACK goto :legacy_database_setting
if defined SUPABASE_URL_WITH_PASS goto :legacy_database_setting
if defined DATABASE_URL goto :legacy_database_setting
if defined DIRECT_URL goto :legacy_database_setting
if defined POSTGRES_URL goto :legacy_database_setting
if defined POSTGRES_PRISMA_URL goto :legacy_database_setting
if defined POSTGRES_URL_NON_POOLING goto :legacy_database_setting
if defined POSTGRES_PASSWORD goto :legacy_database_setting
if defined PG_PASSWORD goto :legacy_database_setting
if defined PGHOST goto :legacy_database_setting
if defined PGPORT goto :legacy_database_setting
if defined PGDATABASE goto :legacy_database_setting
if defined PGUSER goto :legacy_database_setting
if defined PGPASSWORD goto :legacy_database_setting

if not defined SOLVER_WORKER_API_URL goto :missing_gateway_setting
REM Do not expand untrusted environment values into this batch parser. The
REM checksum-pinned launcher validates the exact HTTPS URL before networking.
if not defined SOLVER_WORKER_HMAC_SECRET goto :missing_gateway_setting
if not defined PIO_EXE goto :missing_gateway_setting
if not defined PIO_SOLVER_VERSION goto :missing_gateway_setting
if not defined APPROVED_PIO_BINARY_CHECKSUM goto :missing_gateway_setting
if not defined PIPELINE_COMMIT goto :missing_gateway_setting
if not defined APPROVED_MANIFEST_CHECKSUM goto :missing_gateway_setting
if not defined RANGE_DIRECTORY goto :missing_gateway_setting

echo Signed worker environment is present for %SP_MACHINE_ID%.
echo This check did not print secrets, connect to a database, or start a solver.
echo Complete the operator approval gate before running:
echo   python scripts\preflop-deep\run_machine.py %SP_MACHINE_ID% 2 %SP_PARTITION_INDEX%
exit /b 0

:legacy_database_setting
echo ERROR: A legacy database environment setting is still present.
echo Remove it from process, user, machine, task, wrapper, and profile scopes.
echo Rotate historically exposed credentials centrally. Do not start this worker.
exit /b 1

:missing_gateway_setting
echo ERROR: Required signed-gateway configuration is absent.
echo Provision it from the authorized per-host secret and release records.
echo Never copy the other worker's HMAC value and never store it in this file.
exit /b 1
