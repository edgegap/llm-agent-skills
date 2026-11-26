# Asks for your Edgegap credentials and keeps them in environment variables of THIS PowerShell
# window only. Nothing is written to disk, and closing the window forgets them.
# Dot-source it so the variables stay in your session:
#
#   . .\tools\edgegap-env.ps1          # asks only for what isn't set yet
#   . .\tools\edgegap-env.ps1 -Force   # asks for everything again
#
# Then run tools\edgegap-test.ps1 in the same window.
param([switch]$Force)

function Read-EdgegapSecret([string]$Prompt) {
  $secure = Read-Host -AsSecureString $Prompt
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

$questions = @(
  @{ Name = 'EDGEGAP_API_TOKEN';         Secret = $true;  Prompt = 'Edgegap API token (dashboard: User Settings > Tokens)' },
  @{ Name = 'EDGEGAP_REGISTRY_USERNAME'; Secret = $false; Prompt = 'Container Registry username (dashboard: Container Registry, starts with robot$)' },
  @{ Name = 'EDGEGAP_REGISTRY_TOKEN';    Secret = $true;  Prompt = 'Container Registry token' },
  @{ Name = 'EDGEGAP_REGISTRY_PROJECT';  Secret = $false; Prompt = 'Container Registry project (the <project> in registry.edgegap.com/<project>/...)' }
)

foreach ($q in $questions) {
  $current = [Environment]::GetEnvironmentVariable($q.Name, 'Process')
  if ($current -and -not $Force) { Write-Host "$($q.Name): already set, kept" -ForegroundColor DarkGray; continue }
  $value = if ($q.Secret) { Read-EdgegapSecret $q.Prompt } else { (Read-Host $q.Prompt).Trim() }
  if (-not $value) { Write-Host "$($q.Name): left empty" -ForegroundColor Yellow; continue }
  [Environment]::SetEnvironmentVariable($q.Name, $value, 'Process')
  $shown = if ($q.Secret) { "set ($($value.Length) characters)" } else { "set to $value" }
  Write-Host "$($q.Name): $shown" -ForegroundColor Green
}
Remove-Variable value, current -ErrorAction SilentlyContinue
Write-Host 'Done. These variables live in this window only.' -ForegroundColor Cyan
