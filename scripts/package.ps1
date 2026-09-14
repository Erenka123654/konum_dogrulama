$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskStage = Join-Path $taskRoot ('.local\teslim-' + [Guid]::NewGuid().ToString('N'))
$taskOutput = Join-Path $taskRoot '.local\PDKS-ESP32-Bilgi-Islem.zip'
New-Item -ItemType Directory -Path $taskStage -Force | Out-Null
$taskFiles = @('README.md','index.html','package.json','package-lock.json','.gitignore','checkin-backend/wrangler.toml','checkin-backend/README.md','checkin-backend/schema.sql','firmware/ble_konum_beacon/ble_konum_beacon.ino','firmware/ble_konum_beacon/device_config.example.h')
foreach ($taskDir in @('docs','tests','scripts','web','checkin-backend/src','checkin-backend/migrations')) {
  foreach ($taskItem in Get-ChildItem -LiteralPath (Join-Path $taskRoot $taskDir) -File -Recurse) {
    $taskFiles += [IO.Path]::GetRelativePath($taskRoot,$taskItem.FullName)
  }
}
foreach ($taskFile in $taskFiles) {
  $taskDestination = Join-Path $taskStage $taskFile
  New-Item -ItemType Directory -Path (Split-Path $taskDestination) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $taskRoot $taskFile) -Destination $taskDestination
}
if (Get-ChildItem -LiteralPath $taskStage -Recurse -File | Where-Object { $_.Name -in @('device_config.h','worker-secrets.json','ilk-giris.txt','bootstrap.sql') -or $_.Extension -in @('.bin','.elf') }) { throw 'Private artifact found in delivery stage.' }
Compress-Archive -Path (Join-Path $taskStage '*') -DestinationPath $taskOutput -Force
Write-Output $taskOutput
