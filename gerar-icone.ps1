Add-Type -AssemblyName System.Drawing

function New-AsstecIcon($size, $outPath) {
    $bmp    = New-Object System.Drawing.Bitmap($size, $size)
    $g      = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode   = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    # --- fundo gradiente azul-escuro ---
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(255, 10, 25, 60),
        [System.Drawing.Color]::FromArgb(255, 25, 70, 140),
        [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
    )
    $g.FillRectangle($grad, $rect)

    $cx = $size / 2
    $cy = $size / 2 - ($size * 0.05)

    # --- brilho suave no topo ---
    $glowRect = New-Object System.Drawing.RectangleF(($size*0.1), ($size*0.02), ($size*0.8), ($size*0.5))
    $glow = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $glowRect,
        [System.Drawing.Color]::FromArgb(30, 255, 255, 255),
        [System.Drawing.Color]::FromArgb(0, 255, 255, 255),
        [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
    )
    $g.FillEllipse($glow, $glowRect)

    $gold      = [System.Drawing.Color]::FromArgb(255, 212, 175, 55)
    $goldLight = [System.Drawing.Color]::FromArgb(255, 255, 220, 100)
    $white     = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
    $penGold   = New-Object System.Drawing.Pen($gold, ($size * 0.022))
    $penGoldThin = New-Object System.Drawing.Pen($gold, ($size * 0.014))
    $brushGold = New-Object System.Drawing.SolidBrush($gold)
    $brushGoldL = New-Object System.Drawing.SolidBrush($goldLight)
    $brushWhite = New-Object System.Drawing.SolidBrush($white)

    # --- haste vertical central ---
    $hW = $size * 0.022
    $hH = $size * 0.44
    $hX = $cx - $hW/2
    $hY = $cy - $hH/2 - ($size*0.04)
    $g.FillRectangle($brushGold, $hX, $hY, $hW, $hH)

    # --- base (trapézio simplificado como retângulo arredondado) ---
    $bW = $size * 0.38
    $bH = $size * 0.045
    $bX = $cx - $bW/2
    $bY = $hY + $hH - $bH/2
    $g.FillRectangle($brushGold, $bX, $bY, $bW, $bH)

    # --- pé da balança ---
    $fW = $size * 0.18
    $fH = $size * 0.03
    $fX = $cx - $fW/2
    $fY = $bY + $bH
    $g.FillRectangle($brushGold, $fX, $fY, $fW, $fH)

    # --- braço horizontal ---
    $aW = $size * 0.62
    $aH = $size * 0.022
    $aX = $cx - $aW/2
    $aY = $hY - $aH/2
    $g.FillRectangle($brushGold, $aX, $aY, $aW, $aH)

    # --- pratos (discos dourados) ---
    $pR  = $size * 0.12
    $pY  = $aY + $aH + ($size*0.005)

    # cordas esquerda
    $g.DrawLine($penGoldThin, ($aX + $pR), ($aY + $aH), ($aX + $pR), ($pY))
    $g.DrawLine($penGoldThin, ($aX + $pR*2 - $pR*0.2), ($aY + $aH), ($aX + $pR*2 - $pR*0.3), ($pY))
    # prato esquerdo
    $g.FillEllipse($brushGold, $aX, $pY, $pR*2, $pR*0.45)
    $g.FillEllipse($brushGoldL, ($aX + $pR*0.15), ($pY - $pR*0.06), ($pR*1.7), ($pR*0.28))

    # cordas direita
    $rX = $aX + $aW - $pR*2
    $g.DrawLine($penGoldThin, ($rX + $pR), ($aY + $aH), ($rX + $pR), ($pY))
    $g.DrawLine($penGoldThin, ($rX + $pR*2 - $pR*0.2), ($aY + $aH), ($rX + $pR*2 - $pR*0.3), ($pY))
    # prato direito
    $g.FillEllipse($brushGold, $rX, $pY, $pR*2, $pR*0.45)
    $g.FillEllipse($brushGoldL, ($rX + $pR*0.15), ($pY - $pR*0.06), ($pR*1.7), ($pR*0.28))

    # --- topo da haste (ornamento) ---
    $oR = $size * 0.038
    $g.FillEllipse($brushGoldL, ($cx - $oR), ($hY - $oR*1.2), ($oR*2), ($oR*2))

    # --- texto ASSTEC ---
    $fontSize = $size * 0.11
    $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold)
    $txtSize = $g.MeasureString("ASSTEC", $font)
    $txtX = $cx - $txtSize.Width / 2
    $txtY = $fY + $fH + ($size * 0.03)
    $g.DrawString("ASSTEC", $font, $brushGoldL, $txtX, $txtY)

    # --- linha decorativa abaixo do texto ---
    $lY = $txtY + $txtSize.Height + ($size*0.01)
    $lX1 = $cx - ($size*0.18)
    $lX2 = $cx + ($size*0.18)
    $penLine = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(160,212,175,55), ($size*0.008))
    $g.DrawLine($penLine, $lX1, $lY, $lX2, $lY)

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Host "✅ Gerado: $outPath"
}

New-AsstecIcon 512 ".\public\icon-512.png"
New-AsstecIcon 192 ".\public\icon-192.png"
New-AsstecIcon 180 ".\public\apple-touch-icon.png"
Write-Host "Ícones gerados com sucesso!"
