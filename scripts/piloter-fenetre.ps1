# Envoie une séquence de touches à la fenêtre de l'application.
#
# Sert aux vérifications manuelles sur l'application RÉELLE : se connecter,
# changer d'onglet (F1 à F11), valider un formulaire.
#
#   powershell -File scripts/piloter-fenetre.ps1 -ProcessId 1234 -Keys "admin{TAB}admin123{ENTER}"
param(
    [Parameter(Mandatory = $true)][int]$ProcessId,
    [string]$Keys = "",
    # Clic à des coordonnées exprimées dans la zone client de la fenêtre,
    # c'est-à-dire les mêmes que sur les captures d'écran.
    [int]$ClickX = -1,
    [int]$ClickY = -1,
    [int]$DelayMs = 900,
    # Molette : nombre de crans, positif vers le haut, negatif vers le bas.
    # Le curseur doit d'abord etre place par -ClickX / -ClickY.
    [int]$Scroll = 0
)

Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Drv {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern short GetKeyState(int nVirtKey);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    public const uint LEFTDOWN = 0x0002, LEFTUP = 0x0004, WHEEL = 0x0800;
}
"@

$proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 }
if ($null -eq $proc) {
    Write-Error "Le processus $ProcessId n'a pas de fenetre principale."
    exit 1
}

# Windows refuse parfois la mise au premier plan à un processus qui n'a pas le
# focus. L'appui bref sur ALT lève cette restriction ; on réessaie plusieurs fois.
$actif = $false
for ($i = 0; $i -lt 6 -and -not $actif; $i++) {
    [void][Drv]::ShowWindow($proc.MainWindowHandle, 3)
    [System.Windows.Forms.SendKeys]::SendWait("%")
    [void][Drv]::SetForegroundWindow($proc.MainWindowHandle)
    Start-Sleep -Milliseconds 400
    $actif = ([Drv]::GetForegroundWindow() -eq $proc.MainWindowHandle)
}

# Sans le focus, les touches partiraient dans une autre application.
if (-not $actif) {
    Write-Error "Impossible de mettre la fenetre au premier plan."
    exit 1
}

# L'appui sur ALT a pu ouvrir la barre de menus : on la referme avant d'envoyer
# quoi que ce soit, sinon les touches iraient dans le menu.
[System.Windows.Forms.SendKeys]::SendWait("{ESC}")
Start-Sleep -Milliseconds 250

# Verrouillage majuscules actif : tout ce qui suit partirait en capitales et
# un mot de passe serait refuse. SendKeys "{CAPSLOCK}" n'est pas fiable, on
# simule donc une vraie frappe sur la touche.
if (([Drv]::GetKeyState(0x14) -band 1) -eq 1) {
    [Drv]::keybd_event(0x14, 0, 0, [UIntPtr]::Zero)          # appui
    [Drv]::keybd_event(0x14, 0, 2, [UIntPtr]::Zero)          # relachement
    Start-Sleep -Milliseconds 250
}

if ($ClickX -ge 0 -and $ClickY -ge 0) {
    $origin = New-Object Drv+POINT
    [void][Drv]::ClientToScreen($proc.MainWindowHandle, [ref]$origin)
    [void][Drv]::SetCursorPos($origin.X + $ClickX, $origin.Y + $ClickY)
    Start-Sleep -Milliseconds 150
    [Drv]::mouse_event([Drv]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 60
    [Drv]::mouse_event([Drv]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds $DelayMs
    "Clic a ($ClickX, $ClickY) dans la fenetre $ProcessId"
}

# Molette : Windows attend un multiple de 120 par cran.
if ($Scroll -ne 0) {
    # cButtons est declare non signe : un cran vers le bas s'ecrit en complement a deux.
    $delta = if ($Scroll -gt 0) { [uint32]120 } else { [uint32]4294967176 }
    for ($c = 0; $c -lt [Math]::Abs($Scroll); $c++) {
        [Drv]::mouse_event([Drv]::WHEEL, 0, 0, $delta, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 80
    }
    Start-Sleep -Milliseconds $DelayMs
    "Molette : $Scroll crans dans la fenetre $ProcessId"
}

if ($Keys -ne "") {
    [System.Windows.Forms.SendKeys]::SendWait($Keys)
    Start-Sleep -Milliseconds $DelayMs
    "Touches envoyees a $ProcessId : $Keys"
}
