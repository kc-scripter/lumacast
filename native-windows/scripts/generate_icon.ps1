param(
  [Parameter(Mandatory=$true)][string]$InputPng,
  [Parameter(Mandatory=$true)][string]$OutputIco
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Bitmap]::FromFile($InputPng)
try {
  $bitmap = New-Object System.Drawing.Bitmap 256, 256
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($source, 0, 0, 256, 256)
  }
  finally {
    $graphics.Dispose()
  }

  $directory = Split-Path -Parent $OutputIco
  New-Item -ItemType Directory -Force -Path $directory | Out-Null

  $handle = $bitmap.GetHicon()
  $icon = [System.Drawing.Icon]::FromHandle($handle)
  $stream = [System.IO.File]::Create($OutputIco)
  try {
    $icon.Save($stream)
  }
  finally {
    $stream.Dispose()
    $icon.Dispose()
    $bitmap.Dispose()
  }
}
finally {
  $source.Dispose()
}

if (-not (Test-Path $OutputIco) -or (Get-Item $OutputIco).Length -lt 1000) {
  throw "Falha ao gerar o ícone do Lunira Screen."
}
