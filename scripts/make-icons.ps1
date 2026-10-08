# Erzeugt das App-Symbol (schwarz, leuchtend grüner Chart) mit Windows-Bordmitteln (System.Drawing).
# Aufruf: powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1
Add-Type -AssemblyName System.Drawing

$assets = Join-Path (Split-Path $PSScriptRoot -Parent) 'assets'

function Get-Points([int]$S, [double]$pad) {
  $u = @(@(0.00,0.22), @(0.15,0.40), @(0.29,0.31), @(0.45,0.56), @(0.59,0.45), @(0.76,0.80), @(0.86,0.71), @(1.00,0.97))
  $box = $S * (1 - 2 * $pad)
  $pts = @()
  foreach ($p in $u) { $pts += New-Object System.Drawing.PointF(($S * $pad + $p[0] * $box), ($S * $pad + (1 - $p[1]) * $box * 0.92 + $box * 0.04)) }
  return ,$pts
}

function New-Icon([int]$S, [string]$mode, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap $S, $S
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $neon = [System.Drawing.Color]::FromArgb(255, 43, 227, 111)
  $light = [System.Drawing.Color]::FromArgb(255, 170, 255, 205)
  $pad = 0.15
  if ($mode -eq 'fg' -or $mode -eq 'mono') { $pad = 0.24 }   # Sicherheitsrand für das runde/eckige Zuschneiden unter Android

  if ($mode -eq 'full' -or $mode -eq 'bg') {
    $g.Clear([System.Drawing.Color]::Black)
  } else {
    $g.Clear([System.Drawing.Color]::Transparent)
  }

  if ($mode -eq 'bg') { $g.Dispose(); $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose(); return }

  # sanfter grüner Schein hinten rechts oben + feine Rasterlinien (nur bei vollem Symbol)
  if ($mode -eq 'full') {
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddEllipse([int]($S * 0.15), [int]($S * -0.05), [int]($S * 1.0), [int]($S * 0.9))
    $pb = New-Object System.Drawing.Drawing2D.PathGradientBrush($gp)
    $pb.CenterColor = [System.Drawing.Color]::FromArgb(70, 43, 227, 111)
    $pb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 43, 227, 111))
    $g.FillPath($pb, $gp)
    $grid = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(22, 255, 255, 255), [single]($S * 0.004))
    foreach ($f in 0.30, 0.50, 0.70) { $g.DrawLine($grid, [single]($S * 0.10), [single]($S * $f), [single]($S * 0.90), [single]($S * $f)) }
  }

  $pts = Get-Points $S $pad

  if ($mode -ne 'mono') {
    # Fläche unter der Linie mit Farbverlauf
    $poly = @() + $pts + (New-Object System.Drawing.PointF($pts[$pts.Count - 1].X, [single]($S * (1 - $pad)))) + (New-Object System.Drawing.PointF($pts[0].X, [single]($S * (1 - $pad))))
    $top = ($pts | Measure-Object -Property Y -Minimum).Minimum
    $rect = New-Object System.Drawing.RectangleF(0, [single]$top, [single]$S, [single]($S * (1 - $pad) - $top))
    $lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(120, 43, 227, 111), [System.Drawing.Color]::FromArgb(0, 43, 227, 111), 90)
    $g.FillPolygon($lg, [System.Drawing.PointF[]]$poly)

    # Leuchten der Linie (mehrere breite, durchsichtige Striche)
    foreach ($w in @(@(0.085, 22), @(0.060, 38), @(0.042, 60))) {
      $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb($w[1], 43, 227, 111), [single]($S * $w[0]))
      $pen.LineJoin = 'Round'; $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
      $g.DrawLines($pen, [System.Drawing.PointF[]]$pts)
    }
    $core = New-Object System.Drawing.Pen($neon, [single]($S * 0.034)); $core.LineJoin = 'Round'; $core.StartCap = 'Round'; $core.EndCap = 'Round'
    $g.DrawLines($core, [System.Drawing.PointF[]]$pts)
    $hi = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(190, 170, 255, 205), [single]($S * 0.010)); $hi.LineJoin = 'Round'; $hi.StartCap = 'Round'; $hi.EndCap = 'Round'
    $g.DrawLines($hi, [System.Drawing.PointF[]]$pts)

    # Endpunkt mit Schein
    $e = $pts[$pts.Count - 1]
    foreach ($r in @(@(0.070, 40), @(0.050, 70))) {
      $br = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($r[1], 43, 227, 111))
      $rad = $S * $r[0]
      $g.FillEllipse($br, [single]($e.X - $rad), [single]($e.Y - $rad), [single]($rad * 2), [single]($rad * 2))
    }
    $rad = $S * 0.034
    $g.FillEllipse((New-Object System.Drawing.SolidBrush($light)), [single]($e.X - $rad), [single]($e.Y - $rad), [single]($rad * 2), [single]($rad * 2))
  } else {
    # einfarbige Variante (für Android-Designs „Themed Icons")
    $white = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [single]($S * 0.05)); $white.LineJoin = 'Round'; $white.StartCap = 'Round'; $white.EndCap = 'Round'
    $g.DrawLines($white, [System.Drawing.PointF[]]$pts)
    $e = $pts[$pts.Count - 1]; $rad = $S * 0.055
    $g.FillEllipse([System.Drawing.Brushes]::White, [single]($e.X - $rad), [single]($e.Y - $rad), [single]($rad * 2), [single]($rad * 2))
  }

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

New-Icon 1024 'full' (Join-Path $assets 'icon.png')
New-Icon 1024 'fg'   (Join-Path $assets 'android-icon-foreground.png')
New-Icon 1024 'bg'   (Join-Path $assets 'android-icon-background.png')
New-Icon 1024 'mono' (Join-Path $assets 'android-icon-monochrome.png')
New-Icon 1024 'fg'   (Join-Path $assets 'splash-icon.png')
New-Icon 96   'full' (Join-Path $assets 'favicon.png')
Write-Host 'Symbole erzeugt in' $assets
