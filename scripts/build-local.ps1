param([string]$ToolsRoot = 'D:\Tools\Notka', [switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot
py -3.12 (Join-Path $PSScriptRoot 'prepare-local-deps.py') $ToolsRoot
if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare locked Node dependencies' }
$linuxProject = (wsl -d Ubuntu -- wslpath -u $projectRoot.Replace('\','/')).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve project path in Ubuntu' }
$linuxTools = (wsl -d Ubuntu -- wslpath -u $ToolsRoot.Replace('\','/')).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve tools path in Ubuntu' }
$runner = Join-Path $ToolsRoot 'run-build.sh'
$lines = @(
  'set -eu',
  'tools="$1"',
  'project="$2"',
  'export PATH="$tools/venv/bin:$tools/node/bin:$tools/jdk/bin:$PATH"',
  'export JAVA_HOME="$tools/jdk"',
  'export NOTKA_JAVA="$tools/jdk/bin/java"',
  'export NOTKA_SIGNING_KEY="$tools/keys/signing.pem"',
  'export PIP_CACHE_DIR="$tools/cache/pip"',
  'export npm_config_cache="$tools/cache/npm"',
  'exec python "$project/scripts/local-build.py" "$project" "$tools" "${3:-}"'
)
[IO.File]::WriteAllText($runner, ($lines -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
$option = if ($SkipTests) { '--skip-tests' } else { '' }
wsl -d Ubuntu -- bash "$linuxTools/run-build.sh" $linuxTools $linuxProject $option
if ($LASTEXITCODE -ne 0) { throw "Notka build/checks failed (exit $LASTEXITCODE). See D:\Tools\Notka\build\checks.log" }
