$ErrorActionPreference = 'Stop'
$raizProyecto = Split-Path -Parent $PSScriptRoot
$rutaNode = (Get-Command node).Source
$scriptRespaldo = Join-Path $PSScriptRoot 'respaldo.mjs'
$procesoRespaldo = Start-Process -FilePath $rutaNode -ArgumentList ('"' + $scriptRespaldo + '"') -WorkingDirectory $raizProyecto -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $raizProyecto '.local-secrets\respaldo-programado.stdout.log') -RedirectStandardError (Join-Path $raizProyecto '.local-secrets\respaldo-programado.stderr.log')
exit $procesoRespaldo.ExitCode
