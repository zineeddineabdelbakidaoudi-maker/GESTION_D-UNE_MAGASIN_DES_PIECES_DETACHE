# Exporte chaque diapositive en PNG, via PowerPoint lui-même.
#
# Sert au contrôle visuel : on regarde ce que PowerPoint affiche réellement,
# pas ce qu'un convertisseur tiers en déduit.
#
#   powershell -File presentation/exporter-images.ps1 -Pptx .\Gestion-POS-Presentation.pptx -OutDir .\apercu
param(
    [Parameter(Mandatory = $true)][string]$Pptx,
    [Parameter(Mandatory = $true)][string]$OutDir,
    [int]$Largeur = 1600
)

$ErrorActionPreference = "Stop"
$Pptx = (Resolve-Path $Pptx).Path
if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$OutDir = (Resolve-Path $OutDir).Path

$app = New-Object -ComObject PowerPoint.Application
try {
    # msoFalse = 0 : la fenêtre reste masquée pendant l'export.
    $deck = $app.Presentations.Open($Pptx, $true, $false, $false)
    $hauteur = [int]($Largeur * $deck.PageSetup.SlideHeight / $deck.PageSetup.SlideWidth)
    $deck.Export($OutDir, "PNG", $Largeur, $hauteur)
    $n = $deck.Slides.Count
    $deck.Close()
    "$n diapositives exportees dans $OutDir ($Largeur x $hauteur)"
}
finally {
    $app.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
}
