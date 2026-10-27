# Inicia o Tomodachi Player.
# Se o codigo-fonte mudou desde a ultima compilacao, recompila sozinho antes de abrir
# (mostrando uma janelinha de progresso). Usado pelo "Iniciar Tomodachi Player.exe" da raiz do
# projeto e pelos atalhos do Menu Iniciar / Area de Trabalho.

param([switch]$MarkBuilt)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$unpacked = Join-Path $root 'release\win-unpacked'
$appExe = Join-Path $unpacked 'Tomodachi Player.exe'
$stampFile = Join-Path $root 'release\.build-stamp'
$logFile = Join-Path $root 'release\ultima-compilacao.log'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Show-Error([string]$msg) {
  [System.Windows.Forms.MessageBox]::Show($msg, 'Tomodachi Player', 'OK', 'Error') | Out-Null
}

function Start-App {
  if (Test-Path $appExe) {
    Start-Process -FilePath $appExe -WorkingDirectory $unpacked
    return $true
  }
  return $false
}

# Arquivo mais recente entre os que entram no executavel
function Get-SourceStamp {
  $paths = @('src', 'electron', 'public', 'build\icon.ico', 'build\icon.png', 'package.json', 'index.html',
             'vite.config.ts', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js', 'tsconfig.json')
  $newest = [datetime]::MinValue
  foreach ($p in $paths) {
    $full = Join-Path $root $p
    if (-not (Test-Path $full)) { continue }
    $item = Get-Item $full
    if ($item.PSIsContainer) {
      $f = Get-ChildItem -Path $full -Recurse -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
      if ($f -and $f.LastWriteTimeUtc -gt $newest) { $newest = $f.LastWriteTimeUtc }
    } elseif ($item.LastWriteTimeUtc -gt $newest) {
      $newest = $item.LastWriteTimeUtc
    }
  }
  return $newest.Ticks
}

# Chamado pelo "Gerar executavel e atalhos.bat" logo apos compilar: so registra a versao
if ($MarkBuilt) {
  New-Item -ItemType Directory -Force -Path (Split-Path $stampFile) | Out-Null
  Set-Content -Path $stampFile -Value (Get-SourceStamp) -Encoding ASCII
  exit 0
}

# Ja aberto? So traz a janela para frente (o app tem instancia unica).
$running = Get-Process -Name 'Tomodachi Player' -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -and $_.Path.StartsWith($unpacked, [StringComparison]::OrdinalIgnoreCase) }
if ($running) {
  Start-App | Out-Null
  exit 0
}

$current = Get-SourceStamp
[long]$built = 0
if (Test-Path $stampFile) { [long]::TryParse((Get-Content $stampFile -Raw).Trim(), [ref]$built) | Out-Null }

if ((Test-Path $appExe) -and $built -ge $current) {
  Start-App | Out-Null
  exit 0
}

# ---------- Precisa compilar ----------
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  if (Start-App) { exit 0 }
  Show-Error "Node.js nao encontrado. Instale em https://nodejs.org e abra o Tomodachi Player de novo."
  exit 1
}

# Janela de progresso
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Tomodachi Player'
$form.Size = New-Object System.Drawing.Size(420, 150)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(24, 22, 30)
$form.ForeColor = [System.Drawing.Color]::White
$iconPath = Join-Path $root 'build\icon.ico'
if (Test-Path $iconPath) { $form.Icon = New-Object System.Drawing.Icon($iconPath) }
$label = New-Object System.Windows.Forms.Label
$label.Text = "Atualizando o Tomodachi Player...`nIsso acontece so depois de mudancas e pode levar alguns minutos."
$label.AutoSize = $false
$label.Size = New-Object System.Drawing.Size(380, 44)
$label.Location = New-Object System.Drawing.Point(16, 16)
$label.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$form.Controls.Add($label)
$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Style = 'Marquee'
$bar.MarqueeAnimationSpeed = 30
$bar.Size = New-Object System.Drawing.Size(372, 16)
$bar.Location = New-Object System.Drawing.Point(18, 72)
$form.Controls.Add($bar)
$form.Show()
[System.Windows.Forms.Application]::DoEvents()

function Invoke-Step([string]$text, [string]$npmArgs) {
  $label.Text = $text
  [System.Windows.Forms.Application]::DoEvents()
  Add-Content -Path $logFile -Value "`r`n===== npm $npmArgs ($(Get-Date)) =====" -Encoding UTF8
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'cmd.exe'
  $psi.Arguments = "/d /c npm $npmArgs >> `"$logFile`" 2>&1"
  $psi.WorkingDirectory = $root
  $psi.CreateNoWindow = $true
  $psi.UseShellExecute = $false
  $proc = [System.Diagnostics.Process]::Start($psi)
  while (-not $proc.HasExited) {
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 100
  }
  return $proc.ExitCode
}

New-Item -ItemType Directory -Force -Path (Split-Path $logFile) | Out-Null
Set-Content -Path $logFile -Value "Compilacao iniciada em $(Get-Date)" -Encoding UTF8

$ok = $true
# Dependencias novas (package.json mudou ou node_modules nao existe)
$lock = Join-Path $root 'node_modules\.package-lock.json'
$pkg = Join-Path $root 'package.json'
if (-not (Test-Path $lock) -or (Get-Item $pkg).LastWriteTimeUtc -gt (Get-Item $lock).LastWriteTimeUtc) {
  if ((Invoke-Step "Instalando componentes novos...`nIsso acontece so na primeira vez ou apos atualizacoes." 'install --no-audit --no-fund') -ne 0) { $ok = $false }
}
if ($ok) {
  if ((Invoke-Step "Atualizando o Tomodachi Player...`nIsso acontece so depois de mudancas e pode levar alguns minutos." 'run pack') -ne 0) { $ok = $false }
}
$form.Close()

if ($ok -and (Test-Path $appExe)) {
  Set-Content -Path $stampFile -Value $current -Encoding ASCII
  Start-App | Out-Null
  exit 0
}

$hadOld = Test-Path $appExe
Show-Error ("Nao foi possivel atualizar o Tomodachi Player.`n`nOs detalhes estao em:`n$logFile" +
  $(if ($hadOld) { "`n`nVou abrir a versao anterior." } else { '' }))
Start-App | Out-Null
exit 1
