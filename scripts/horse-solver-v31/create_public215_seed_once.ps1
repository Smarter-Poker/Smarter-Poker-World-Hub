# One-shot private M2 holdout seed + public commitment for ANY public215 dataset.
# Dataset-agnostic form of R7's create-corrected-r7-seed-once.ps1: the R7 run is
# reproduced exactly by
#   -TaskFolder mac-v31-r7-corrected-20261030-01a17e88 -CommitmentLabel corrected_r7
# Controller tooling only (not an approved pipeline file). SOURCE ONLY until Root
# reviews and explicitly invokes it, once, on the M2 host. It refuses an existing
# folder, never prints/reads back the seed and never removes or retries anything.
param(
 [Parameter(Mandatory=$true)][ValidatePattern('^mac-v31-[a-z0-9][a-z0-9-]{8,100}$')][string]$TaskFolder,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9][a-z0-9_]{1,39}$')][string]$CommitmentLabel,
 [ValidatePattern('^[A-Za-z0-9-]{1,15}$')][string]$ExpectedHost='SMARTERPOKER',
 [ValidatePattern('^[a-z0-9-]{1,15}\\[a-z0-9._-]{1,20}$')][string]$ExpectedAccount='smarterpoker\danbe'
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Set-StrictMode -Version Latest
[Console]::OutputEncoding=[Text.UTF8Encoding]::new()
$directory=Join-Path 'C:\sp-v31' $TaskFolder
$seedPath=Join-Path $directory 'blind-holdout-seed.bin'
$receiptPath=Join-Path $directory 'seed-commitment.public.json'
$format="public215_${CommitmentLabel}_seed_commitment_v1"
$bytes=$null
$rng=$null
function Need([bool]$condition,[string]$message){if(-not $condition){throw $message}}
function Write-NewBytes([string]$path,[byte[]]$payload){
 $stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$stream.Write($payload,0,$payload.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
Need ([IO.Path]::GetDirectoryName($directory) -ceq 'C:\sp-v31') 'Seed folder must be a direct child of C:\sp-v31'
Need ($env:COMPUTERNAME -ieq $ExpectedHost) 'Wrong host'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
Need ($identity.Name.ToLowerInvariant() -ceq $ExpectedAccount.ToLowerInvariant()) 'Wrong account'
Need (-not (Test-Path -LiteralPath $directory)) 'Replacement folder exists; inspect outcome, never regenerate'
# New-Item refuses an existing directory. No private material exists until the
# protected ACL has been installed and verified. A failure retains this folder
# as a durable stop condition; this script never removes or retries anything.
New-Item -ItemType Directory -Path $directory -ErrorAction Stop|Out-Null
$acl=New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true,$false)
$acl.SetOwner($identity.User)
$allowed=@($identity.User.Value,'S-1-5-18','S-1-5-32-544')|Select-Object -Unique
foreach($sidText in $allowed){
 $sid=New-Object Security.Principal.SecurityIdentifier($sidText)
 $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
 $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $directory -AclObject $acl
$actual=Get-Acl -LiteralPath $directory
Need $actual.AreAccessRulesProtected 'Private directory inheritance remains enabled'
$rules=@($actual.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
Need ($rules.Count -eq $allowed.Count) 'Unexpected private directory access rule count'
foreach($rule in $rules){
 Need ($allowed -contains $rule.IdentityReference.Value) 'Unexpected private directory trustee'
 Need (-not $rule.IsInherited -and $rule.AccessControlType -eq 'Allow' -and
  $rule.FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl -and
  $rule.InheritanceFlags -eq ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit) -and
  $rule.PropagationFlags -eq [Security.AccessControl.PropagationFlags]::None) 'Unexpected private directory permission'
}
try {
 $bytes=New-Object byte[] 32
 $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
 $rng.GetBytes($bytes)
 $hasher=[Security.Cryptography.SHA256]::Create()
 try{$commitment=([BitConverter]::ToString($hasher.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()}
 Write-NewBytes $seedPath $bytes
 $receipt=[ordered]@{format=$format;host=$ExpectedHost;account=$ExpectedAccount;seed_path=$seedPath;seed_bytes=32;seed_commitment_checksum=$commitment;created_at=[DateTime]::UtcNow.ToString('o');file_readback_performed=$false;seed_printed=$false;private_acl_verified=$true}
 $public=[Text.UTF8Encoding]::new($false).GetBytes(($receipt|ConvertTo-Json -Compress))
 Write-NewBytes $receiptPath $public
 $receipt|ConvertTo-Json -Compress
} finally {
 if($null -ne $bytes){[Array]::Clear($bytes,0,$bytes.Length)}
 if($null -ne $rng){$rng.Dispose()}
}
