$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$node = if (Test-Path $bundledNode) { $bundledNode } else { (Get-Command node).Source }
$major = [int]((& $node --version).TrimStart('v').Split('.')[0])
if ($major -lt 20) { throw 'Install Node.js 20 or newer to run this project.' }
$env:PATH = (Split-Path $node) + ';' + $env:PATH
$env:DB_BACKEND = 'memory'
& $node node_modules/next/dist/bin/next dev --hostname 127.0.0.1
exit $LASTEXITCODE
