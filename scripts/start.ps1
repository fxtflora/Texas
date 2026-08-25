# Texas Hold'em 一键启动脚本
# 使用方法：在项目根目录双击运行，或在 PowerShell 中执行 .\scripts\start.ps1

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "  🎴  Texas Hold'em Server Launcher" -ForegroundColor Yellow
Write-Host "  ─────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# 检查 Node.js
try {
    $nodeVersion = node --version
    Write-Host "  ✅ Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ❌ 未检测到 Node.js，请先安装：https://nodejs.org" -ForegroundColor Red
    Read-Host "按 Enter 退出"
    exit 1
}

# 检查依赖是否已安装
$serverModules = Join-Path $projectRoot "server\node_modules"
$clientModules = Join-Path $projectRoot "client\node_modules"

if (-not (Test-Path $serverModules) -or -not (Test-Path $clientModules)) {
    Write-Host "  📦 首次运行，正在安装依赖（约1-2分钟）..." -ForegroundColor Cyan
    Set-Location (Join-Path $projectRoot "server")
    npm install --silent
    Set-Location (Join-Path $projectRoot "client")
    npm install --silent
    Write-Host "  ✅ 依赖安装完成" -ForegroundColor Green
}

Write-Host "  🧹 清理残留端口..." -ForegroundColor DarkGray
@(3000, 5173) | ForEach-Object {
    $port = $_
    $p = (netstat -ano | Select-String ":$port " | Select-String "LISTENING" | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1)
    if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Write-Host "  ✅ 已释放端口 $port (PID $p)" -ForegroundColor DarkGray }
}

Write-Host "  🚀 启动服务器..." -ForegroundColor Cyan
Write-Host ""

# 同时启动 server 和 client
Set-Location $projectRoot

# 启动后端（新窗口）
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot\server'; Write-Host '🎴 后端服务器' -ForegroundColor Cyan; npm run dev"

# 稍等2秒让后端先启动
Start-Sleep -Seconds 2

# 启动前端（新窗口）
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot\client'; Write-Host '🌐 前端开发服务器' -ForegroundColor Green; npm run dev"

Write-Host "  ✅ 服务已在后台启动！" -ForegroundColor Green
Write-Host ""
Write-Host "  📡 后端服务:  http://localhost:3000" -ForegroundColor White
Write-Host "  🌐 前端页面:  http://localhost:5173" -ForegroundColor White
Write-Host "  ❤️  健康检查: http://localhost:3000/health" -ForegroundColor White
Write-Host ""
Write-Host "  💡 打开浏览器访问 http://localhost:5173 即可测试" -ForegroundColor Yellow
Write-Host ""
Read-Host "按 Enter 关闭此窗口（服务继续在后台运行）"
