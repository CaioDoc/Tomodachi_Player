# Cria o "Iniciar Tomodachi Player.exe" (inicializador) na raiz do projeto e os atalhos
# na Area de Trabalho e no Menu Iniciar.
#
# O inicializador abre o app e, se o codigo mudou desde a ultima vez, recompila
# sozinho antes (scripts\iniciar.ps1). Assim nao e preciso rodar o .bat de novo.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$icon = Join-Path $root 'build\icon.ico'
$launcherScript = Join-Path $root 'scripts\iniciar.ps1'
$launcherExe = Join-Path $root 'Iniciar Tomodachi Player.exe'

# ---------- 1. Compila o inicializador (.exe pequeno, sem janela de console) ----------
$code = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

static class TomodachiLauncher {
  [STAThread]
  static void Main() {
    string dir = AppDomain.CurrentDomain.BaseDirectory;
    string script = Path.Combine(dir, "scripts", "iniciar.ps1");
    if (!File.Exists(script)) {
      MessageBox.Show("Arquivo nao encontrado:\n" + script, "Tomodachi Player", MessageBoxButtons.OK, MessageBoxIcon.Error);
      return;
    }
    ProcessStartInfo psi = new ProcessStartInfo("powershell.exe",
      "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + script + "\"");
    psi.WorkingDirectory = dir;
    psi.CreateNoWindow = true;
    psi.UseShellExecute = false;
    Process.Start(psi);
  }
}
'@

$launcherOk = $false
try {
  if (Test-Path $launcherExe) { Remove-Item $launcherExe -Force }
  $provider = New-Object Microsoft.CSharp.CSharpCodeProvider
  $params = New-Object System.CodeDom.Compiler.CompilerParameters
  $params.GenerateExecutable = $true
  $params.OutputAssembly = $launcherExe
  $opts = '/target:winexe /optimize'
  if (Test-Path $icon) { $opts += " /win32icon:`"$icon`"" }
  $params.CompilerOptions = $opts
  [void]$params.ReferencedAssemblies.Add('System.dll')
  [void]$params.ReferencedAssemblies.Add('System.Windows.Forms.dll')
  $result = $provider.CompileAssemblyFromSource($params, $code)
  if ($result.Errors.HasErrors) {
    $result.Errors | ForEach-Object { Write-Host $_.ToString() -ForegroundColor Yellow }
  } else {
    $launcherOk = Test-Path $launcherExe
  }
} catch {
  Write-Host "Aviso: nao foi possivel criar o inicializador .exe ($($_.Exception.Message))" -ForegroundColor Yellow
}

if ($launcherOk) {
  Write-Host "Inicializador criado: $launcherExe" -ForegroundColor Green
} else {
  Write-Host 'Usando o PowerShell diretamente nos atalhos.' -ForegroundColor Yellow
}

# ---------- 2. Atalhos ----------
$shell = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Tomodachi Player.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Tomodachi Player.lnk')
)

foreach ($lnkPath in $targets) {
  $lnk = $shell.CreateShortcut($lnkPath)
  if ($launcherOk) {
    $lnk.TargetPath = $launcherExe
    $lnk.Arguments = ''
  } else {
    $lnk.TargetPath = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
    $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherScript`""
    $lnk.WindowStyle = 7
  }
  $lnk.WorkingDirectory = $root
  if (Test-Path $icon) { $lnk.IconLocation = "$icon,0" }
  $lnk.Description = 'Tomodachi Player - Mangas e Animes'
  $lnk.Save()
  Write-Host "Atalho criado: $lnkPath" -ForegroundColor Green
}

Write-Host ''
Write-Host 'Pronto! Procure "Tomodachi Player" no Menu Iniciar, clique com o botao direito'
Write-Host 'e escolha "Fixar em Iniciar" (e/ou "Fixar na barra de tarefas").'
Write-Host 'Daqui pra frente o atalho atualiza o app sozinho quando houver mudancas.'
