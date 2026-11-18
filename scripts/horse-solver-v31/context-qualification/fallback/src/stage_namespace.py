"""Stage-independent namespace ownership; refuses foreign or unsealed state."""
import re

def ensure_namespace(remote_ps, remote, freeze_sha256):
 if not re.fullmatch('[0-9a-f]{64}',freeze_sha256):raise ValueError('freeze digest')
 if not re.fullmatch(r'C:\\sp-v31\\hv31-fallback-[a-z0-9-]+',remote):raise ValueError('owned namespace')
 proof=remote_ps("$ErrorActionPreference='Stop';$p='"+remote+"';$f='"+freeze_sha256+"';$m=$p+'\\campaign-freeze.txt';$created=$false;if(Test-Path -LiteralPath $p){if(!(Test-Path -LiteralPath $m) -or (Get-Content -Raw -LiteralPath $m).Trim() -ne $f){throw 'foreign or unsealed namespace'}}else{New-Item -ItemType Directory -Path $p|Out-Null;Set-Content -LiteralPath $m -Value $f -Encoding ASCII;$created=$true};@{created=$created;freeze=$f}|ConvertTo-Json -Compress")
 if proof.get('freeze')!=freeze_sha256 or type(proof.get('created')) is not bool:raise ValueError('namespace ownership proof')
 return proof['created']
