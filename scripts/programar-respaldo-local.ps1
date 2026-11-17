$ErrorActionPreference = 'Stop'
$raizProyecto = Split-Path -Parent $PSScriptRoot
$archivoRespaldo = Join-Path $raizProyecto 'scripts\ejecutar-respaldo-local.ps1'
$argumentosTarea = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $archivoRespaldo + '"'
$accionTarea = New-ScheduledTaskAction -Execute (Get-Command powershell.exe).Source -Argument $argumentosTarea -WorkingDirectory $raizProyecto
$zonaBogota = [TimeZoneInfo]::FindSystemTimeZoneById('SA Pacific Standard Time')
$ahoraBogota = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $zonaBogota)
$horaBogota = [DateTime]::SpecifyKind($ahoraBogota.Date.AddHours(18), [DateTimeKind]::Unspecified)
$horaLocal = [TimeZoneInfo]::ConvertTimeToUtc($horaBogota, $zonaBogota).ToLocalTime()
$disparador = New-ScheduledTaskTrigger -Daily -At $horaLocal
$identidadTarea = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principalTarea = New-ScheduledTaskPrincipal -UserId $identidadTarea -LogonType Interactive -RunLevel Limited
$ajustesTarea = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName 'Cardio-Respaldo-Cifrado-Local' -Action $accionTarea -Trigger $disparador -Principal $principalTarea -Settings $ajustesTarea -Description 'Respaldo cifrado de MySQL y restauración de prueba. Requiere sesión iniciada y Docker disponible.' -Force | Out-Null
Write-Output 'Respaldo local programado diariamente a las 18:00 de Bogotá. Requiere una sesión de Windows iniciada y MySQL en Docker disponible.'
