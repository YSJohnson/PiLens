$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NativeIcon {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool DestroyIcon(IntPtr handle);
}
'@

$workspacePath = Split-Path -Parent $PSScriptRoot
$buildPath = Join-Path $workspacePath 'build'
New-Item -ItemType Directory -Force -Path $buildPath | Out-Null

function New-RoundedPath([float] $x, [float] $y, [float] $width, [float] $height, [float] $radius) {
    $diameter = $radius * 2
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
    $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
    $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-PiIcon([int] $size) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $inset = $size * 0.055
    $side = $size - ($inset * 2)
    $shape = New-RoundedPath $inset $inset $side $side ($size * 0.205)
    $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.PointF]::new($inset, $inset),
        [System.Drawing.PointF]::new($size - $inset, $size - $inset),
        [System.Drawing.Color]::FromArgb(255, 157, 123, 255),
        [System.Drawing.Color]::FromArgb(255, 82, 49, 178)
    )
    $graphics.FillPath($gradient, $shape)

    $highlight = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(72, 255, 255, 255), [Math]::Max(1, $size * 0.012))
    $graphics.DrawPath($highlight, $shape)

    $font = [System.Drawing.Font]::new('Cambria', $size * 0.53, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(248, 255, 255, 255))
    $textBounds = [System.Drawing.RectangleF]::new(0, -($size * 0.035), $size, $size)
    $graphics.DrawString([char]0x03C0, $font, $textBrush, $textBounds, $format)

    $dotBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 164, 226, 94))
    $dotSize = $size * 0.075
    $graphics.FillEllipse($dotBrush, $size * 0.78, $size * 0.77, $dotSize, $dotSize)

    $dotBrush.Dispose()
    $textBrush.Dispose()
    $format.Dispose()
    $font.Dispose()
    $highlight.Dispose()
    $gradient.Dispose()
    $shape.Dispose()
    $graphics.Dispose()
    return $bitmap
}

$pngBitmap = New-PiIcon 512
$pngBitmap.Save((Join-Path $buildPath 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$pngBitmap.Dispose()

$icoBitmap = New-PiIcon 256
$iconHandle = $icoBitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$stream = [System.IO.File]::Create((Join-Path $buildPath 'icon.ico'))
$icon.Save($stream)
$stream.Dispose()
$icon.Dispose()
[NativeIcon]::DestroyIcon($iconHandle) | Out-Null
$icoBitmap.Dispose()

Write-Host "Generated build/icon.png and build/icon.ico"
