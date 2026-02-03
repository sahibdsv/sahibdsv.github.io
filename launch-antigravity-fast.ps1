# Fast Antigravity Launcher
# This script launches Antigravity with GPU acceleration flags to fix lag issues
# Based on Reddit community performance optimizations

$antigravityPath = "C:\Users\sahib\AppData\Local\antigravity\bin\antigravity.cmd"

$performanceArgs = @(
    "--disable-gpu-driver-bug-workarounds",
    "--ignore-gpu-blacklist", 
    "--enable-gpu-rasterization",
    "--enable-zero-copy",
    "--enable-native-gpu-memory-buffers"
)

Write-Host "🚀 Launching Antigravity with performance optimizations..." -ForegroundColor Green
Write-Host "Flags: $($performanceArgs -join ' ')" -ForegroundColor Cyan

& $antigravityPath $performanceArgs

Write-Host "`n✅ Antigravity launched!" -ForegroundColor Green
