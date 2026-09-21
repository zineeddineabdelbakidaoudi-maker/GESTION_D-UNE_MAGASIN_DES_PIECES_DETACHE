# Parcourt l'application réelle et capture chaque écran.
#
# Les images produites servent d'illustrations dans la présentation client :
# ce sont des captures de l'application en fonctionnement, sur une base de
# démonstration alimentée par les vrais traitements.
#
#   powershell -File scripts/captures-presentation.ps1 -ProcessId 1234 -OutDir .\captures
param(
    [Parameter(Mandatory = $true)][int]$ProcessId,
    [Parameter(Mandatory = $true)][string]$OutDir
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$drv = Join-Path $here "piloter-fenetre.ps1"
$cap = Join-Path $here "capture-fenetre.ps1"

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

# Abscisse du centre de chaque onglet, relevée sur la barre d'onglets.
$onglets = @{
    caisse        = 56
    produits      = 152
    stock         = 245
    achats        = 351
    clients       = 460
    fournisseurs  = 569
    depenses      = 690
    rapports      = 796
    journal       = 983
    utilisateurs  = 1089
    parametres    = 1205
}

function Aller($nom) {
    & $drv -ProcessId $ProcessId -ClickX $onglets[$nom] -ClickY 148 -DelayMs 1800 | Out-Null
}

function Prendre($fichier) {
    & $cap -ProcessId $ProcessId -Out (Join-Path $OutDir $fichier) -DelaySeconds 1
}

$plan = @(
    @{ onglet = "caisse";       fichier = "10-caisse.png" },
    @{ onglet = "produits";     fichier = "20-produits.png" },
    @{ onglet = "stock";        fichier = "30-stock.png" },
    @{ onglet = "achats";       fichier = "40-achats.png" },
    @{ onglet = "clients";      fichier = "50-clients.png" },
    @{ onglet = "fournisseurs"; fichier = "55-fournisseurs.png" },
    @{ onglet = "depenses";     fichier = "60-depenses.png" },
    @{ onglet = "rapports";     fichier = "70-rapports.png" },
    @{ onglet = "journal";      fichier = "80-journal.png" },
    @{ onglet = "utilisateurs"; fichier = "90-utilisateurs.png" },
    @{ onglet = "parametres";   fichier = "95-parametres.png" }
)

foreach ($etape in $plan) {
    Aller $etape.onglet
    Prendre $etape.fichier
}
