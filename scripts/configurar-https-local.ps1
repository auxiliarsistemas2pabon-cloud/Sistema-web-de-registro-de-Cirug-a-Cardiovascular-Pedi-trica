$ErrorActionPreference = 'Stop'
$raizProyecto = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $raizProyecto
$secretosLocales = Join-Path $raizProyecto '.local-secrets'
New-Item -ItemType Directory -Path $secretosLocales -Force | Out-Null
$identidadLocal = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $secretosLocales /inheritance:r /grant:r ($identidadLocal + ':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron proteger los certificados.' }
$archivoPfx = Join-Path $secretosLocales 'localhost.pfx'
$archivoClave = Join-Path $secretosLocales 'localhost-pfx.pass'
if (-not (Test-Path -LiteralPath $archivoPfx)) {
  $bytesClave = New-Object byte[] 32
  $generador = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $generador.GetBytes($bytesClave)
  $generador.Dispose()
  $clavePfx = [Convert]::ToBase64String($bytesClave)
  [System.IO.File]::WriteAllText($archivoClave, $clavePfx)
  $claveSegura = ConvertTo-SecureString -String $clavePfx -AsPlainText -Force
  $certificadoLocal = New-SelfSignedCertificate -Subject 'CN=localhost' -DnsName 'localhost', '127.0.0.1' -CertStoreLocation 'Cert:\CurrentUser\My' -Type SSLServerAuthentication -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(1) -FriendlyName 'Cardio local HTTPS'
  Export-PfxCertificate -Cert $certificadoLocal -FilePath $archivoPfx -Password $claveSegura -CryptoAlgorithmOption AES256_SHA256 | Out-Null
  $archivoPublico = Join-Path $secretosLocales 'localhost.cer'
  Export-Certificate -Cert $certificadoLocal -FilePath $archivoPublico | Out-Null
  Import-Certificate -FilePath $archivoPublico -CertStoreLocation 'Cert:\CurrentUser\Root' -Confirm:$false | Out-Null
}
$archivoEntorno = Join-Path $raizProyecto '.env'
$contenidoEntorno = [System.IO.File]::ReadAllText($archivoEntorno)
foreach ($valorEntorno in @('LOCAL_HTTPS=true', 'LOCAL_TLS_PFX_FILE=.local-secrets/localhost.pfx', 'LOCAL_TLS_PFX_PASSWORD_FILE=.local-secrets/localhost-pfx.pass', 'HOST=127.0.0.1', 'PORT=3443', 'TRUST_PROXY=0')) {
  $claveEntorno = $valorEntorno.Split('=')[0]
  $patronEntorno = '(?m)^' + [regex]::Escape($claveEntorno) + '=.*$'
  if ([regex]::IsMatch($contenidoEntorno, $patronEntorno)) { $contenidoEntorno = [regex]::Replace($contenidoEntorno, $patronEntorno, $valorEntorno) }
  else { $contenidoEntorno += "`n$valorEntorno`n" }
}
[System.IO.File]::WriteAllText($archivoEntorno, $contenidoEntorno)
Write-Output 'HTTPS local configurado para https://localhost:3443. El certificado se confía solo en la cuenta de Windows actual y expira en un año.'
