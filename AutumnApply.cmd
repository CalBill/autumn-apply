@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 20 或更高版本：https://nodejs.org/
  goto :error
)

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
if errorlevel 1 (
  echo 当前 Node.js 版本过低，请安装 Node.js 20 或更高版本。
  goto :error
)

if not exist node_modules\ (
  echo 首次启动：正在安装依赖……
  call npm install
  if errorlevel 1 goto :error
)

call npm run launch
if errorlevel 1 goto :error

echo.
echo AutumnApply 已启动。首次使用请在 Chrome 中加载打开的 dist\extension 文件夹。
pause
exit /b 0

:error
echo.
echo 启动失败。请保留此窗口中的错误信息，然后按任意键退出。
pause
exit /b 1
