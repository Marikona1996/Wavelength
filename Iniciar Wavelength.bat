@echo off
cd /d "%~dp0"
title Wavelength - NO CIERRES ESTA VENTANA
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install
)
echo.
echo   ====================================================
echo    WAVELENGTH
echo.
echo    Pantalla principal:  http://localhost:3000
echo    Los celulares usan la direccion que aparece abajo.
echo.
echo    NO CIERRES ESTA VENTANA durante el juego.
echo   ====================================================
echo.
start "" http://localhost:3000
:loop
node server.js
echo.
echo   *** El servidor se detuvo. Reiniciando en 3 segundos ***
echo   *** La partida se recupera sola. Ctrl+C para salir   ***
timeout /t 3 >nul
goto loop
