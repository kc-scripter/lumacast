param(
  [string]$Version = "1.0.0",
  [string]$WebUrl = $env:LUNIRA_WEB_URL
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WebUrl)) {
  $WebUrl = "https://lumacast-live-kc.onrender.com/"
}

$uri = $null
if (-not [Uri]::TryCreate($WebUrl, [UriKind]::Absolute, [ref]$uri)) {
  throw "LUNIRA_WEB_URL não é uma URL válida: $WebUrl"
}

if ($uri.Scheme -ne "https" -and -not (($uri.Host -eq "localhost" -or $uri.Host -eq "127.0.0.1") -and $uri.Scheme -eq "http")) {
  throw "LUNIRA_WEB_URL precisa usar HTTPS em produção."
}

if ($Version -notmatch '^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$') {
  throw "Versão inválida: $Version"
}

$root = Split-Path -Parent $PSScriptRoot
Set-Content -Path (Join-Path $root "web-url.txt") -Value $uri.AbsoluteUri -Encoding UTF8

Push-Location $root
try {
  dotnet restore .\LuniraScreen.csproj
  dotnet build .\LuniraScreen.csproj -c Release --no-restore /p:Version=$Version /p:FileVersion=$Version /p:AssemblyVersion=$Version
  if ($LASTEXITCODE -ne 0) { throw "Falha no build do cliente Windows." }

  $iscc = Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"
  if (-not (Test-Path $iscc)) {
    throw "Inno Setup 6 não encontrado."
  }

  & $iscc "/DMyAppVersion=$Version" ".\installer.iss"
  if ($LASTEXITCODE -ne 0) { throw "Falha ao gerar o instalador." }
}
finally {
  Pop-Location
}
