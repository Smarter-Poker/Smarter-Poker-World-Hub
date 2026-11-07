# One approved COMPACTOR registration for ANY public215 dataset, run once on M2.
# Dataset-agnostic form of R7's register-corrected-public215-once.ps1: every
# identity R7 hard-coded is read from the SHA-256-pinned
# public215_registration_pins_v1 file named by -PinsPath/-PinsSha256, which
# register_public215_once.py also verifies. Controller tooling only (not an
# approved pipeline file). It refuses existing evidence, never retries, and only
# this supervisor decrypts the COMPACTOR credential (cleared in finally).
param(
 [Parameter(Mandatory=$true)][string]$PinsPath,
 [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{64}$')][string]$PinsSha256
)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';Set-StrictMode -Version Latest
[Console]::OutputEncoding=[Text.UTF8Encoding]::new()
function Need([bool]$ok,[string]$message){if(-not $ok){throw $message}}
function SHA([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function NewJson([string]$path,$value){$b=[Text.UTF8Encoding]::new($false).GetBytes(($value|ConvertTo-Json -Depth 8 -Compress));$f=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$f.Write($b,0,$b.Length);$f.Flush($true)}finally{$f.Dispose()}}
Need ((SHA $PinsPath) -ceq $PinsSha256) 'Registration pins differ'
$Pins=[IO.File]::ReadAllText($PinsPath)|ConvertFrom-Json
Need ($Pins.format -ceq 'public215_registration_pins_v1') 'Registration pins format'
$task=$Pins.task_root;$repo=Join-Path $task 'pipeline';$git=$Pins.git;$python=$Pins.python
$controller=Join-Path $repo 'scripts\horse-solver-v31\register_public215_once.py'
$operation=Join-Path $task 'register-once';$claim=Join-Path $task 'register-once.claim.json'
$manifest=Join-Path (Join-Path $task 'inputs') $Pins.manifest_relative;$expected=$Pins.manifest_sha256
function GitRead([string]$arguments){
 $p=New-Object Diagnostics.Process;$p.StartInfo.FileName=$git;$p.StartInfo.Arguments=$arguments
 $p.StartInfo.UseShellExecute=$false;$p.StartInfo.RedirectStandardOutput=$true;$p.StartInfo.RedirectStandardError=$true;$p.StartInfo.CreateNoWindow=$true
 Need ($p.Start()) 'Git could not start';$handle=$p.Handle;Need ($handle -ne [IntPtr]::Zero) 'Git native handle unavailable'
 $stdout=$p.StandardOutput.ReadToEnd();$stderr=$p.StandardError.ReadToEnd();$p.WaitForExit();$code=$p.ExitCode
 Need ($null -ne $code -and $code -is [int] -and $code -eq 0) 'Read-only producer Git check failed'
 $p.Dispose();return $stdout.Trim()
}
Need ($env:COMPUTERNAME -ieq $Pins.host -and [Security.Principal.WindowsIdentity]::GetCurrent().Name -ieq $Pins.account) 'M2 identity mismatch'
Need ((SHA $manifest) -ceq $expected -and (SHA $controller) -ceq $Pins.controller_sha256 -and (SHA $python) -ceq $Pins.python_sha256) 'Public control/runtime pins differ'
$head=GitRead ('--no-optional-locks -C "'+$repo+'" rev-parse HEAD');Need ($head -ceq $Pins.pipeline_commit) 'Producer HEAD differs'
$status=GitRead ('--no-optional-locks -C "'+$repo+'" status --porcelain');Need (-not $status) 'Producer is dirty'
Need (-not (Test-Path -LiteralPath $operation) -and -not (Test-Path -LiteralPath $claim) -and -not (Test-Path -LiteralPath (Join-Path $task 'registered-contract.json'))) 'Registration evidence exists; inspect original outcome, never retry'
# New public operation records make every unknown outcome durable and exclusive.
New-Item -ItemType Directory -Path $operation -ErrorAction Stop|Out-Null
NewJson $claim ([ordered]@{format='public215_registration_claim_v1';dataset_key=$Pins.dataset_key;manifest_checksum=$expected;controller_checksum=$Pins.controller_sha256;pins_checksum=$PinsSha256;attempts=1;claimed_at=[DateTime]::UtcNow.ToString('o');supervisor_pid=$PID})
$native=$null;$process=$null;$wrapper=1
try {
$root=$Pins.recipient_root
$receipt=Get-Content -LiteralPath (Join-Path $root 'receipt.json') -Raw | ConvertFrom-Json
if($receipt.status -ne 'complete' -or $receipt.principal -ne 'COMPACTOR' -or $receipt.ciphertext.algorithm -ne 'RSA-4096-OAEP-SHA256-MGF1-SHA256'){throw 'Unverified separate COMPACTOR provisioning receipt'}
$cipherPath=Join-Path $root 'recipient-hmac.oaep-sha256.bin'
$cipher=[IO.File]::ReadAllBytes($cipherPath)
if((Get-FileHash -LiteralPath $cipherPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.ciphertext.sha256 -or $cipher.Length -ne 512){throw 'Compactor ciphertext integrity failure'}
$key=Get-Content -LiteralPath (Join-Path $root 'recipient-rsa4096.private.json') -Raw | ConvertFrom-Json
$parameters=New-Object Security.Cryptography.RSAParameters
foreach($name in @('Modulus','Exponent','P','Q','DP','DQ','InverseQ','D')){$parameters.$name=[Convert]::FromBase64String($key.$name)}
$rsa=New-Object Security.Cryptography.RSACng
$rsa.ImportParameters($parameters)
$plain=$null
$code=1
try {
 $plain=$rsa.Decrypt($cipher,[Security.Cryptography.RSAEncryptionPadding]::OaepSHA256)
 $secret=[Text.Encoding]::ASCII.GetString($plain)
 if($secret -notmatch '^[0-9a-f]{64}$' -or $secret -eq ('0'*64)){throw 'Compactor credential invalid'}
 $env:HORSE_SOLVER_V31_HMAC_SECRET=$secret
 $env:HORSE_SOLVER_V31_GATEWAY_URL=$Pins.gateway_url
 $env:APPROVED_MANIFEST_CHECKSUM=$expected
 $env:PYTHONDONTWRITEBYTECODE='1'
 $arguments=@('-B','-u',('"'+$controller+'"'),'--manifest',('"'+$manifest+'"'),'--input-root',('"'+(Join-Path $task 'inputs')+'"'),'--pipeline-root',('"'+$repo+'"'),'--pins',('"'+$PinsPath+'"'),'--pins-sha256',$PinsSha256)
 $process=Start-Process -FilePath $python -ArgumentList $arguments -PassThru -RedirectStandardOutput (Join-Path $operation 'stdout.log') -RedirectStandardError (Join-Path $operation 'stderr.log')
 $handle=$process.Handle;Need ($handle -ne [IntPtr]::Zero) 'Native registration handle unavailable'
 NewJson (Join-Path $operation 'started.json') ([ordered]@{controller_pid=$process.Id;supervisor_pid=$PID;started_at=[DateTime]::UtcNow.ToString('o')})
 $process.WaitForExit();$native=$process.ExitCode
 Need ($null -ne $native -and $native -is [int]) 'Native registration outcome unknown'
 $code=$native
} finally {
 $env:HORSE_SOLVER_V31_HMAC_SECRET=$null;$secret=$null
 if($null -ne $plain){[Array]::Clear($plain,0,$plain.Length)}
 $rsa.Dispose()
}
 $wrapper=$code
} catch {$wrapper=1} finally {
 NewJson (Join-Path $operation 'result.json') ([ordered]@{format='public215_registration_result_v1';native_exit_code=$native;wrapper_exit_code=$wrapper;manifest_checksum=$expected;controller_checksum=$Pins.controller_sha256;pins_checksum=$PinsSha256;finished_at=[DateTime]::UtcNow.ToString('o');capture_started=$false;sealed=$false;certified=$false;promotion_requested=$false})
}
exit $wrapper
