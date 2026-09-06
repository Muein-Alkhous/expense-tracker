param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath
)

$ErrorActionPreference = "Stop"

$installer = (Resolve-Path $InstallerPath).Path
$expectedName = "Expense Tracker"

Write-Host "Installing $installer"
$install = Start-Process -FilePath $installer -ArgumentList "/S" -Wait -PassThru
if ($install.ExitCode -ne 0) {
  throw "Installer exited with code $($install.ExitCode)"
}

$uninstallKey = Get-ChildItem "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall" |
  Get-ItemProperty |
  Where-Object { $_.DisplayName -eq $expectedName } |
  Select-Object -First 1

if (-not $uninstallKey) {
  throw "Expense Tracker uninstall registration was not found"
}

$installLocation = $uninstallKey.InstallLocation
if (-not $installLocation -or -not (Test-Path $installLocation)) {
  throw "Expense Tracker install location was not found"
}

$app = Get-ChildItem $installLocation -Filter "*.exe" |
  Where-Object { $_.Name -notmatch "uninstall" } |
  Select-Object -First 1

if (-not $app) {
  throw "Installed application executable was not found"
}

Write-Host "Launching $($app.FullName)"
$process = Start-Process -FilePath $app.FullName -PassThru
Start-Sleep -Seconds 8
if ($process.HasExited) {
  throw "Expense Tracker exited unexpectedly with code $($process.ExitCode)"
}
$process.CloseMainWindow() | Out-Null
Start-Sleep -Seconds 2
if (-not $process.HasExited) {
  Stop-Process -Id $process.Id
}

$uninstallCommand = $uninstallKey.UninstallString.Trim('"')
Write-Host "Uninstalling Expense Tracker"
$uninstall = Start-Process -FilePath $uninstallCommand -ArgumentList "/S" -Wait -PassThru
if ($uninstall.ExitCode -ne 0) {
  throw "Uninstaller exited with code $($uninstall.ExitCode)"
}

Write-Host "Windows installer smoke test passed"
