# One-shot M1 (training split) capture supervisor for ANY public215 dataset.
# Dataset-agnostic form of R7's capture-M1-once.native-handle.ps1: every identity
# R7 hard-coded (root folder, manifest, bundle, producer files, census, dataset key)
# comes from the SHA-256-pinned public215_m1_capture_pins_v1 file named by
# -PinsPath/-PinsSha256. Controller tooling only (not an approved pipeline file).
# It refuses an existing claim or harvest folder (no implicit retry). Only the
# unchanged canonical launcher reads the M1 recipient store and sets the HMAC.
param(
 [Parameter(Mandatory=$true)][string]$DatasetId,
 [Parameter(Mandatory=$true)][string]$RegisteredContractChecksum,
 [Parameter(Mandatory=$true)][string]$PinsPath,
 [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{64}$')][string]$PinsSha256
)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';Set-StrictMode -Version Latest
[Console]::OutputEncoding=[Text.UTF8Encoding]::new()
function Need([bool]$value,[string]$message){if(-not $value){throw $message}}
function SHA([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Read-PublicJson([string]$path){$item=Get-Item -LiteralPath $path;Need (-not $item.PSIsContainer -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -and $item.Length -le 2097152) 'Canonical public metadata required';[IO.File]::ReadAllText($path)|ConvertFrom-Json}
function Write-NewJson([string]$path,$value){$b=[Text.UTF8Encoding]::new($false).GetBytes(($value|ConvertTo-Json -Depth 10 -Compress));$f=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$f.Write($b,0,$b.Length);$f.Flush($true)}finally{$f.Dispose()}}
Need ((SHA $PinsPath) -ceq $PinsSha256) 'Capture pins mismatch';$Pins=Read-PublicJson $PinsPath
Need ($Pins.contract -ceq 'public215_m1_capture_pins_v1' -and $Pins.machine -ceq 'M1') 'M1 capture pins format'
$Root=$Pins.remote_root;$Repo=Join-Path $Root 'pipeline';$Inputs=Join-Path $Root 'inputs'
$Operation=Join-Path $Root 'capture-M1-once'
$Launcher=$Pins.launcher;$Python=$Pins.python;$Pio=$Pins.pio;$Git=$Pins.git
function GitRead([string]$arguments){
 $p=New-Object Diagnostics.Process;$p.StartInfo.FileName=$Git;$p.StartInfo.Arguments=$arguments
 $p.StartInfo.UseShellExecute=$false;$p.StartInfo.RedirectStandardOutput=$true;$p.StartInfo.RedirectStandardError=$true;$p.StartInfo.CreateNoWindow=$true
 Need ($p.Start()) 'Git could not start';$handle=$p.Handle;Need ($handle -ne [IntPtr]::Zero) 'Git native handle unavailable'
 $stdout=$p.StandardOutput.ReadToEnd();$stderr=$p.StandardError.ReadToEnd();$p.WaitForExit();$code=$p.ExitCode
 Need ($null -ne $code -and $code -is [int] -and $code -eq 0) 'Read-only producer Git check failed'
 $p.Dispose();return $stdout.Trim()
}
Need ($env:COMPUTERNAME -ieq $Pins.host -and [Security.Principal.WindowsIdentity]::GetCurrent().Name.ToLowerInvariant() -ceq $Pins.account.ToLowerInvariant()) 'M1 host/account mismatch'
Need ($DatasetId -cmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' -and $DatasetId -cne '00000000-0000-0000-0000-000000000000') 'Canonical nonzero dataset UUID required'
Need ($DatasetId -cne $Pins.input_bundle_id) 'The bundle UUID is never the dataset UUID'
Need ($RegisteredContractChecksum -cmatch '^[0-9a-f]{64}$' -and $RegisteredContractChecksum -cne ('0'*64)) 'Actual nonzero registered readback checksum required'
Need ((SHA $Launcher) -ceq $Pins.launcher_checksum -and (SHA $Python) -ceq $Pins.python_checksum -and (SHA $Pio) -ceq $Pins.pio_checksum) 'Approved launcher/runtime mismatch'
$Manifest=Join-Path $Inputs $Pins.manifest_relative;Need ((SHA $Manifest) -ceq $Pins.manifest_checksum) 'Approved manifest differs'
Need ($Pins.pipeline_files.Count -eq 9) 'Nine producer files required'
foreach($file in $Pins.pipeline_files){Need ($file.path -cmatch '^scripts/horse-solver-v31/[A-Za-z0-9_.-]+$' -and (SHA (Join-Path $Repo $file.path)) -ceq $file.checksum) 'Protected producer source differs'}
$head=GitRead ('--no-optional-locks -C "'+$Repo+'" rev-parse HEAD');Need ($head -ceq $Pins.pipeline_commit) 'Protected producer HEAD differs'
$status=GitRead ('--no-optional-locks -C "'+$Repo+'" status --porcelain');Need (-not $status) 'Producer must be clean'
$ReadbackPath=Join-Path $Root 'registered-contract.json';Need ((SHA $ReadbackPath) -ceq $RegisteredContractChecksum) 'Actual registered readback differs';$Readback=Read-PublicJson $ReadbackPath
$keys=@($Readback.PSObject.Properties.Name|Sort-Object)
Need (($keys -join ',') -ceq 'contract,dataset_id,dataset_key,input_bundle_checksum,input_bundle_id,manifest_checksum,observed_at,state') 'Exact registered metadata keys required'
Need ($Readback.contract -ceq 'smarter-poker.public215-registered-contract-readback.v1' -and $Readback.dataset_id -ceq $DatasetId -and $Readback.dataset_key -ceq $Pins.dataset_key -and $Readback.state -ceq 'building') 'Registered dataset identity differs'
Need ($Readback.input_bundle_id -ceq $Pins.input_bundle_id -and $Readback.input_bundle_checksum -ceq $Pins.input_bundle_checksum -and $Readback.manifest_checksum -ceq $Pins.manifest_checksum) 'Registered bundle differs'
Need (-not (Test-Path -LiteralPath $Operation) -and -not (Test-Path -LiteralPath (Join-Path $Root 'harvest'))) 'Capture/harvest already exists; inspect original outcome, never retry'
New-Item -ItemType Directory -Path $Operation -ErrorAction Stop|Out-Null
Write-NewJson (Join-Path $Operation 'claim.json') ([ordered]@{contract='smarter-poker.public215-M1-capture-claim.v1';dataset_id=$DatasetId;dataset_key=$Pins.dataset_key;manifest_checksum=$Pins.manifest_checksum;input_bundle_checksum=$Pins.input_bundle_checksum;registered_contract_checksum=$RegisteredContractChecksum;pins_checksum=$PinsSha256;supervisor_pid=$PID;planned=$Pins.planned_M1;claimed_at=[DateTime]::UtcNow.ToString('o');worker_live_uuid_comparison=$false})
# The unchanged canonical launcher alone accesses its configured recipient store.
# Its maintained worker authenticates dataset_contract before Pio or capture.
$env:PATH=(Split-Path $Python)+';'+$env:PATH;$env:PIO_EXE=$Pio
$env:APPROVED_PIO_BINARY_CHECKSUM=$Pins.pio_checksum;$env:APPROVED_MANIFEST_CHECKSUM=$Pins.manifest_checksum
$env:PIPELINE_COMMIT=$Pins.pipeline_commit;$env:PYTHONDONTWRITEBYTECODE='1'
$arguments=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+$Launcher+'"'),'-Machine','M1','-Repo',('"'+$Repo+'"'),'-InputRoot',('"'+$Inputs+'"'),'-ManifestRelative',$Pins.manifest_relative,'-ManifestChecksum',$Pins.manifest_checksum,'-PipelineCommit',$Pins.pipeline_commit,'-WorkDirectory',('"'+(Join-Path $Root 'harvest')+'"'))
$PowerShell=Join-Path $PSHOME 'powershell.exe';$exitCode=$null;$process=$null
try{
 $process=Start-Process -FilePath $PowerShell -ArgumentList $arguments -PassThru -RedirectStandardOutput (Join-Path $Operation 'stdout.log') -RedirectStandardError (Join-Path $Operation 'stderr.log')
 $handle=$process.Handle;Need ($handle -ne [IntPtr]::Zero) 'Native launcher handle unavailable'
 Write-NewJson (Join-Path $Operation 'started.json') ([ordered]@{contract='smarter-poker.public215-M1-capture-started.v1';dataset_id=$DatasetId;supervisor_pid=$PID;launcher_pid=$process.Id;started_at=[DateTime]::UtcNow.ToString('o')})
 $process.WaitForExit();$exitCode=$process.ExitCode
 Need ($null -ne $exitCode -and $exitCode -is [int]) 'Native launcher outcome unknown'
 Write-NewJson (Join-Path $Operation 'terminal.json') ([ordered]@{contract='smarter-poker.public215-M1-capture-terminal.v1';dataset_id=$DatasetId;manifest_checksum=$Pins.manifest_checksum;supervisor_pid=$PID;launcher_pid=$process.Id;launcher_exit_code=$exitCode;completed_at=[DateTime]::UtcNow.ToString('o');source_completeness_verified=$false;certified=$false})
}catch{
 if(-not (Test-Path -LiteralPath (Join-Path $Operation 'terminal.json'))){Write-NewJson (Join-Path $Operation 'terminal.json') ([ordered]@{contract='smarter-poker.public215-M1-capture-terminal.v1';dataset_id=$DatasetId;supervisor_pid=$PID;launcher_pid=$(if($null -ne $process){$process.Id}else{$null});launcher_exit_code=$null;status='supervisor-failed-inspect-durable-state';completed_at=[DateTime]::UtcNow.ToString('o');source_completeness_verified=$false;certified=$false})}
 exit 1
}
exit $exitCode
