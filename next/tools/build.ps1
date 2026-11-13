param(
    [ValidateSet('Release', 'Debug', 'Test', 'Lint')][string]$Mode = 'Release',
    [string]$ToolsRoot = 'D:\Tools\Notka',
    [switch]$WindowsNetwork
)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot
$localTools = Join-Path $ToolsRoot 'next'
$linuxProject = (wsl -d Ubuntu -- wslpath -u $project.Replace('\', '/')).Trim()
$linuxTools = (wsl -d Ubuntu -- wslpath -u $ToolsRoot.Replace('\', '/')).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Ubuntu cannot resolve the Notka paths.' }
if ($WindowsNetwork) {
    # Optional bridge for a VPN that is available on Windows but not inside WSL.
    $bridge = Join-Path $PSScriptRoot 'maven-cache.py'
    Copy-Item -LiteralPath $bridge -Destination (Join-Path $localTools 'maven-cache.py') -Force
    $workers = Get-CimInstance Win32_Process -Filter "name = 'python.exe'" | Where-Object { $_.CommandLine -match 'maven-cache\.py.*worker' }
    if (-not $workers) {
        $python = (py -3.12 -c 'import sys; print(sys.executable)').Trim()
        Start-Process -FilePath $python -ArgumentList @('-u', (Join-Path $localTools 'maven-cache.py'), 'worker') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $localTools 'maven-worker.log') -RedirectStandardError (Join-Path $localTools 'maven-worker-errors.log') | Out-Null
    }
    wsl -d Ubuntu -- python3 -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:18763/health",timeout=2).close()' 2>$null
    if ($LASTEXITCODE -ne 0) {
        Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d', 'Ubuntu', '--', 'python3', "$linuxTools/next/maven-cache.py", 'serve') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $localTools 'maven-server.log') -RedirectStandardError (Join-Path $localTools 'maven-server-errors.log') | Out-Null
        Start-Sleep -Seconds 2
    }
}
$tasks = switch ($Mode) {
    'Release' { @(':app:assembleRelease') }
    'Debug' { @(':app:assembleDebug', ':app:assembleDebugAndroidTest') }
    'Test' { @('-PcoreOnly=true', ':core:test') }
    'Lint' { @(':app:lintDebug') }
}
$network = if ($WindowsNetwork) { '1' } else { '0' }
wsl -d Ubuntu -- env "NOTKA_TOOLS=$linuxTools" "NOTKA_LOCAL_MAVEN=$network" bash "$linuxProject/tools/check-android.sh" @tasks
if ($LASTEXITCODE -ne 0) { throw "Notka 2 $Mode failed. See the build output." }
Write-Host "Completed $Mode. Build files: $localTools\build"
