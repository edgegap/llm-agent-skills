# Windows helper: build the server image, create the Edgegap app version, start one test
# deployment near you and stop it. Uses the variables set by tools\edgegap-env.ps1 (same window).
#
#   .\tools\edgegap-test.ps1 build              # docker build + push registry.edgegap.com/<project>/splat-arena:<UTC time>
#   .\tools\edgegap-test.ps1 version            # create the app (first time) and an app version for that tag
#   .\tools\edgegap-test.ps1 deploy             # one deployment near your public IP, prints the wss:// URL
#   .\tools\edgegap-test.ps1 status [-Id <id>]  # deployment status
#   .\tools\edgegap-test.ps1 stop   [-Id <id>]  # stop a deployment
#   .\tools\edgegap-test.ps1 all                # asks for credentials, then build, version, deploy, and
#                                               # waits for the server to stop itself after the match
#                                               # (stops it after 15 minutes otherwise)
#
# Docker: uses docker.exe if it is on PATH, otherwise Docker Engine inside WSL (wsl -e docker).
# Secrets are never printed and never passed on a command line.
param(
  [Parameter(Mandatory = $true, Position = 0)][ValidateSet('build', 'version', 'deploy', 'status', 'stop', 'all')][string]$Step,
  [string]$Tag = $env:EDGEGAP_TEST_TAG,
  [string]$Id = $env:EDGEGAP_TEST_DEPLOYMENT,
  [string]$App = 'splat-arena'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$api = 'https://api.edgegap.com'

function Assert-Env([string[]]$Names) {
  foreach ($n in $Names) {
    if (-not [Environment]::GetEnvironmentVariable($n, 'Process')) { throw "$n is not set. Run: . .\tools\edgegap-env.ps1" }
  }
}

function Invoke-Edgegap([string]$Method, [string]$Path, $Body) {
  Assert-Env 'EDGEGAP_API_TOKEN'
  $token = $env:EDGEGAP_API_TOKEN
  if ($token -notlike 'token *') { $token = "token $token" }
  $params = @{ Method = $Method; Uri = "$api$Path"; Headers = @{ Authorization = $token }; ContentType = 'application/json' }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 10) }
  try { Invoke-RestMethod @params }
  catch {
    $detail = $_.ErrorDetails.Message
    throw "Edgegap API $Method $Path failed: $($_.Exception.Message) $detail"
  }
}

function Invoke-Docker([string[]]$DockerArgs, [string]$StdIn) {
  $useWsl = -not (Get-Command docker -ErrorAction SilentlyContinue)
  $exe = if ($useWsl) { 'wsl' } else { 'docker' }
  $allArgs = if ($useWsl) { @('-e', 'docker') + $DockerArgs } else { $DockerArgs }
  if ($StdIn) { $StdIn | & $exe @allArgs } else { & $exe @allArgs }
  if ($LASTEXITCODE -ne 0) { throw "docker $($DockerArgs[0]) failed (exit $LASTEXITCODE)" }
}

function Get-BuildContext {
  if (Get-Command docker -ErrorAction SilentlyContinue) { return $root }
  return (wsl -e wslpath -a ($root -replace '\\', '/')).Trim()
}

switch ($Step) {
  'build' {
    Assert-Env 'EDGEGAP_REGISTRY_USERNAME', 'EDGEGAP_REGISTRY_TOKEN', 'EDGEGAP_REGISTRY_PROJECT'
    if (-not $PSBoundParameters.ContainsKey('Tag')) { $Tag = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmm') }
    $image = "registry.edgegap.com/$($env:EDGEGAP_REGISTRY_PROJECT)/${App}:$Tag"
    Write-Host "Logging in to registry.edgegap.com as $($env:EDGEGAP_REGISTRY_USERNAME)" -ForegroundColor Cyan
    Invoke-Docker @('login', 'registry.edgegap.com', '-u', $env:EDGEGAP_REGISTRY_USERNAME, '--password-stdin') $env:EDGEGAP_REGISTRY_TOKEN
    Write-Host "Building $image" -ForegroundColor Cyan
    Invoke-Docker @('build', '--platform', 'linux/amd64', '-t', $image, (Get-BuildContext))
    Write-Host "Pushing $image" -ForegroundColor Cyan
    Invoke-Docker @('push', $image)
    $env:EDGEGAP_TEST_TAG = $Tag
    Write-Host "Pushed $image (tag remembered in this window for the next steps)" -ForegroundColor Green
  }

  'version' {
    Assert-Env 'EDGEGAP_REGISTRY_USERNAME', 'EDGEGAP_REGISTRY_TOKEN', 'EDGEGAP_REGISTRY_PROJECT'
    if (-not $Tag) { throw 'No tag: run the build step first, or pass -Tag <tag>.' }
    try { Invoke-Edgegap GET "/v1/app/$App" | Out-Null; Write-Host "App $App exists" -ForegroundColor DarkGray }
    catch {
      Write-Host "Creating app $App" -ForegroundColor Cyan
      Invoke-Edgegap POST '/v1/app' @{ name = $App; is_active = $true; image = '' } | Out-Null
    }
    Write-Host "Creating version $Tag" -ForegroundColor Cyan
    $version = @{
      name              = $Tag
      is_active         = $true
      docker_repository = 'registry.edgegap.com'
      docker_image      = "$($env:EDGEGAP_REGISTRY_PROJECT)/$App"
      docker_tag        = $Tag
      private_username  = $env:EDGEGAP_REGISTRY_USERNAME
      private_token     = $env:EDGEGAP_REGISTRY_TOKEN
      req_cpu           = 256
      req_memory        = 512
      max_duration      = 30
      restart_policy    = 'never'
      ports             = @(@{ port = 7777; protocol = 'WS'; name = 'gameport'; to_check = $true; tls_upgrade = $true })
    }
    Invoke-Edgegap POST "/v1/app/$App/version" $version | Out-Null
    Write-Host "Version $App/$Tag ready: port 7777 WS + TLS Upgrade, 0.25 vCPU / 512 MB, max 30 min, restart never" -ForegroundColor Green
  }

  'deploy' {
    if (-not $Tag) { throw 'No tag: pass -Tag <version name>.' }
    $ip = (Invoke-RestMethod 'https://api.ipify.org').Trim()
    $body = @{
      application = $App
      version     = $Tag
      users       = @(@{ user_type = 'ip_address'; user_data = @{ ip_address = $ip } })
      tags        = @($App, 'test')
    }
    $id = (Invoke-Edgegap POST '/v2/deployments' $body).request_id
    $env:EDGEGAP_TEST_DEPLOYMENT = $id
    Write-Host "Deployment $id starting near you..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddMinutes(5)
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Seconds 3
      $s = Invoke-Edgegap GET "/v1/status/$id"
      if ($s.error) { throw "Deployment $id failed: $($s.error_detail) $($s.current_status)" }
      if ($s.running) {
        $url = "wss://$($s.fqdn):$($s.ports.gameport.external)"
        Write-Host "READY $url  ($($s.location.city), $($s.location.country))" -ForegroundColor Green
        Write-Host "Play: http://localhost:8080/?server=$([uri]::EscapeDataString($url))"
        Write-Host "Test: set SERVER_URL=$url and run node tools/e2e.mjs 2"
        return
      }
      Write-Host "  $($s.current_status)"
    }
    throw "Deployment $id not ready after 5 minutes"
  }

  'status' {
    if (-not $Id) { throw 'Pass -Id <request id>.' }
    $s = Invoke-Edgegap GET "/v1/status/$Id"
    Write-Host "$Id $($s.current_status) running=$($s.running) $($s.fqdn)"
  }

  'stop' {
    if (-not $Id) { throw 'Pass -Id <request id>.' }
    Invoke-Edgegap DELETE "/v1/stop/$Id" | Out-Null
    Write-Host "Stopping $Id" -ForegroundColor Green
  }

  'all' {
    . (Join-Path $PSScriptRoot 'edgegap-env.ps1')
    & $PSCommandPath build -App $App
    & $PSCommandPath version -App $App
    & $PSCommandPath deploy -App $App
    $Id = $env:EDGEGAP_TEST_DEPLOYMENT
    Write-Host "Watching ${Id}: play a match on it now. Waiting for the server to stop itself (max 15 min)..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddMinutes(15)
    $last = ''
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Seconds 10
      try { $s = Invoke-Edgegap GET "/v1/status/$Id" } catch { Write-Host "$Id is gone: it stopped itself." -ForegroundColor Green; return }
      if ($s.current_status -ne $last) { $last = $s.current_status; Write-Host "  $(Get-Date -Format HH:mm:ss) $last" }
      if (-not $s.running -and $last -match 'TERMINAT|ERROR') { Write-Host "$Id stopped: $last" -ForegroundColor Green; return }
    }
    Write-Host "$Id still running after 15 minutes, stopping it." -ForegroundColor Yellow
    & $PSCommandPath stop -Id $Id
  }
}
