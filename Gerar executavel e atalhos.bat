@echo off
title Tomodachi Player - Gerar executavel
cd /d "%~dp0"

echo.
echo === Tomodachi Player: gerando executavel provisorio ===
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js/npm nao encontrado. Instale em https://nodejs.org e tente de novo.
  goto fim
)

if not exist "node_modules" (
  echo Instalando dependencias, aguarde...
  call npm install
  if errorlevel 1 goto erro
)

echo Fechando o Tomodachi Player se estiver aberto...
taskkill /IM "Tomodachi Player.exe" /F >nul 2>nul

echo.
echo [1/2] Compilando e empacotando (pode levar alguns minutos)...
call npm run pack
if errorlevel 1 goto erro

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar.ps1" -MarkBuilt

echo.
echo [2/2] Criando o inicializador e os atalhos (Area de Trabalho e Menu Iniciar)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\criar-atalhos.ps1"
if errorlevel 1 goto erro

echo.
echo Daqui pra frente use o atalho "Tomodachi Player" do Menu Iniciar:
echo ele atualiza o app sozinho quando houver mudancas. Este .bat nao e mais necessario.

echo.
echo Concluido! Abrindo o Tomodachi Player...
start "" "%~dp0release\win-unpacked\Tomodachi Player.exe"
goto fim

:erro
echo.
echo [ERRO] Algo deu errado. Copie as mensagens acima e me envie.

:fim
echo.
pause
