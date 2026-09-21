# Capture la fenêtre de l'application dans un PNG.
#
# Sert à vérifier visuellement l'application RÉELLE en cours d'exécution :
# la fenêtre est mise au premier plan, puis son contenu est copié depuis l'écran.
#
#   powershell -File scripts/capture-fenetre.ps1 -Process "Gestion Pieces..." -Out capture.png
param(
    [string]$Process = "Gestion Pieces Cycles et Motos POS",
    # Cible une instance précise : plusieurs fenêtres de l'application peuvent
    # être ouvertes en même temps (chacune avec son propre dossier de données).
    [int]$ProcessId = 0,
    [Parameter(Mandatory = $true)][string]$Out,
    [int]$DelaySeconds = 2
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
}
"@

if ($ProcessId -ne 0) {
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowHandle -ne 0 }
    if ($null -eq $proc) {
        Write-Error "Le processus $ProcessId n'a pas de fenetre principale."
        exit 1
    }
} else {
    $proc = Get-Process -Name $Process -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowHandle -ne 0 } |
            Select-Object -First 1
    if ($null -eq $proc) {
        Write-Error "Aucune fenetre trouvee pour le processus '$Process'."
        exit 1
    }
}

$handle = $proc.MainWindowHandle
[void][Win]::ShowWindow($handle, 3)        # SW_MAXIMIZE
[void][Win]::SetForegroundWindow($handle)
Start-Sleep -Seconds $DelaySeconds

# La zone client exclut la barre de titre et les bordures : on capture
# exactement ce que l'application dessine.
$rect = New-Object Win+RECT
[void][Win]::GetClientRect($handle, [ref]$rect)
$origin = New-Object Win+POINT
[void][Win]::ClientToScreen($handle, [ref]$origin)

$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) {
    Write-Error "Dimensions de fenetre invalides ($width x $height)."
    exit 1
}

$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($origin.X, $origin.Y, 0, 0, $bitmap.Size)
$graphics.Dispose()

$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

"$Out ($width x $height)"
