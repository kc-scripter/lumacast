$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$outDir = Join-Path (Split-Path -Parent $PSScriptRoot) "Assets"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$outFile = Join-Path $outDir "Lunira.ico"

$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#7C5CFF"))
$shape = New-RoundedRectPath 0 0 $size $size 58
$g.FillPath($bg, $shape)

$white = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 20
$white.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$white.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$white.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$g.DrawRectangle($white, 68, 80, 120, 80)
$g.DrawLine($white, 128, 160, 128, 194)
$g.DrawLine($white, 98, 194, 158, 194)

$pink = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#FF4D79"))
$g.FillEllipse($pink, 160, 56, 56, 56)

$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$stream = [System.IO.File]::Create($outFile)
try {
  $icon.Save($stream)
}
finally {
  $stream.Dispose()
  $icon.Dispose()
  $white.Dispose()
  $pink.Dispose()
  $bg.Dispose()
  $shape.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}

Write-Host "Ícone gerado em $outFile"
