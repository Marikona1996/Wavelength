@echo off
cd /d "%~dp0"
title Wavelength - Direccion publica (NO CIERRES ESTA VENTANA)
echo.
echo   ==========================================================
echo    Esto crea una direccion de internet para tu juego local.
echo    Sirve para que entren desde datos moviles u otra casa.
echo.
echo    Primero debe estar corriendo "Iniciar Wavelength.bat".
echo   ==========================================================
echo.

if exist cloudflared.exe goto run
where cloudflared.exe >nul 2>&1 && goto run

echo   Falta el programa "cloudflared.exe" (es de Cloudflare, gratuito).
echo.
echo   1) Se va a abrir la pagina de descarga.
echo   2) Descarga el archivo "cloudflared-windows-amd64.exe".
echo   3) Renombralo a "cloudflared.exe".
echo   4) Ponlo en esta misma carpeta.
echo   5) Vuelve a abrir este archivo.
echo.
pause
start "" https://github.com/cloudflare/cloudflared/releases/latest
exit /b

:run
echo   Creando la direccion publica...
echo   Busca abajo el enlace que termina en ".trycloudflare.com"
echo   Esa es la direccion de la PANTALLA. Los celulares entran
echo   a esa misma direccion agregando  /jugar  al final.
echo.
cloudflared.exe tunnel --url http://localhost:3000
echo.
echo   *** El tunel se cerro. ***
pause
