Add-Type -AssemblyName System.Drawing

$proj = "C:\Users\Tanish Hire\Documents\Programming ALL\mobile-apps\bookmarked"
$green = [System.Drawing.ColorTranslator]::FromHtml("#00E054")
$white = [System.Drawing.Color]::White

function New-RibbonIcon {
  param([int]$Size, [string]$Path, [bool]$BlackBg, [System.Drawing.Color]$RibbonColor, [double]$Scale)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  if ($BlackBg) { $g.Clear([System.Drawing.Color]::Black) } else { $g.Clear([System.Drawing.Color]::Transparent) }
  $brush = New-Object System.Drawing.SolidBrush($RibbonColor)
  $w = $Size * 0.36 * $Scale
  $h = $Size * 0.56 * $Scale
  $x0 = ($Size - $w) / 2.0
  $y0 = ($Size - $h) / 2.0
  $notch = $h * 0.20
  $pts = @(
    (New-Object System.Drawing.PointF($x0, $y0)),
    (New-Object System.Drawing.PointF(($x0 + $w), $y0)),
    (New-Object System.Drawing.PointF(($x0 + $w), ($y0 + $h))),
    (New-Object System.Drawing.PointF(($x0 + $w / 2.0), ($y0 + $h - $notch))),
    (New-Object System.Drawing.PointF($x0, ($y0 + $h)))
  )
  $g.FillPolygon($brush, $pts)
  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "wrote $Path"
}

function New-SolidBlack {
  param([int]$Size, [string]$Path)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Black)
  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "wrote $Path"
}

function New-OgImage {
  param([string]$Path)
  $bmp = New-Object System.Drawing.Bitmap(1200, 630)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $g.Clear([System.Drawing.Color]::Black)
  $brush = New-Object System.Drawing.SolidBrush($green)
  $x0 = 150.0; $y0 = 165.0; $w = 180.0; $h = 300.0; $notch = 60.0
  $pts = @(
    (New-Object System.Drawing.PointF($x0, $y0)),
    (New-Object System.Drawing.PointF(($x0 + $w), $y0)),
    (New-Object System.Drawing.PointF(($x0 + $w), ($y0 + $h))),
    (New-Object System.Drawing.PointF(($x0 + $w / 2.0), ($y0 + $h - $notch))),
    (New-Object System.Drawing.PointF($x0, ($y0 + $h)))
  )
  $g.FillPolygon($brush, $pts)
  $titleFont = New-Object System.Drawing.Font("Segoe UI", 72, [System.Drawing.FontStyle]::Bold)
  $subFont = New-Object System.Drawing.Font("Segoe UI", 30)
  $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $grayBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#9A9A9A"))
  $g.DrawString("Bookmarked", $titleFont, $whiteBrush, 420, 220)
  $g.DrawString("A personal Letterboxd for books", $subFont, $grayBrush, 428, 350)
  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "wrote $Path"
}

New-Item -ItemType Directory -Force "$proj\public" | Out-Null

New-RibbonIcon -Size 1024 -Path "$proj\assets\icon.png" -BlackBg $true -RibbonColor $green -Scale 1.0
New-RibbonIcon -Size 1024 -Path "$proj\assets\android-icon-foreground.png" -BlackBg $false -RibbonColor $green -Scale 0.62
New-SolidBlack -Size 1024 -Path "$proj\assets\android-icon-background.png"
New-RibbonIcon -Size 1024 -Path "$proj\assets\android-icon-monochrome.png" -BlackBg $false -RibbonColor $white -Scale 0.62
New-RibbonIcon -Size 48 -Path "$proj\assets\favicon.png" -BlackBg $true -RibbonColor $green -Scale 1.0
New-RibbonIcon -Size 180 -Path "$proj\public\apple-touch-icon.png" -BlackBg $true -RibbonColor $green -Scale 1.0
New-RibbonIcon -Size 192 -Path "$proj\public\icon-192.png" -BlackBg $true -RibbonColor $green -Scale 1.0
New-RibbonIcon -Size 512 -Path "$proj\public\icon-512.png" -BlackBg $true -RibbonColor $green -Scale 1.0
New-OgImage -Path "$proj\public\og-image.png"
