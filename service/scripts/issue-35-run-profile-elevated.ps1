<#
.SYNOPSIS
Mede um ou três perfis do Player com PresentMon após solicitar UAC ao Windows.
.EXAMPLE
./service/scripts/issue-35-run-profile-elevated.ps1 -Profile all -OutputPath ./Logs/rnf-v2 -PresentMonPath ./Logs/issue-35-tools/PresentMon-2.6.0-x64.exe
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('visual', 'reduced', 'sector', 'all')]
  [string]$Profile,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [Parameter(Mandatory = $true)]
  [string]$PresentMonPath,

  [string]$PlayerPath,

  [string]$NodePath,

  [ValidateRange(5, 600)]
  [int]$Seconds = 600,

  [switch]$Describe,

  [switch]$Elevated
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$logs = [IO.Path]::GetFullPath((Join-Path $root 'Logs'))
if (-not $PlayerPath) { $PlayerPath = Join-Path $root 'unity/Builds/WarRoom3D-M5-Final/WarRoom3D.exe' }
$player = [IO.Path]::GetFullPath($PlayerPath)
$monitor = [IO.Path]::GetFullPath($PresentMonPath)
$output = [IO.Path]::GetFullPath($OutputPath)
if (-not $output.StartsWith($logs + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'OutputPath deve ficar dentro de Logs/ do projeto.'
}
$profiles = if ($Profile -eq 'all') { @('visual', 'reduced', 'sector') } else { @($Profile) }
$outputs = @($profiles | ForEach-Object { if ($Profile -eq 'all') { "$output-$_" } else { $output } })
$smokeOutput = if ($Profile -eq 'all') { "$output-smoke" } else { $null }
foreach ($candidate in @($outputs) + @($smokeOutput | Where-Object { $_ })) {
  if (Test-Path -LiteralPath $candidate) { throw "Saída já existe: $candidate" }
}
$statusPath = "$output-status.json"
if (Test-Path -LiteralPath $statusPath) { throw "Status já existe: $statusPath" }
$elevationErrorPath = "$output-elevation.err.txt"
if (Test-Path -LiteralPath $elevationErrorPath) { throw "Diagnóstico já existe: $elevationErrorPath" }
if (-not (Test-Path -LiteralPath $player -PathType Leaf)) { throw "Player ausente: $player" }
if (-not (Test-Path -LiteralPath $monitor -PathType Leaf)) { throw "PresentMon ausente: $monitor" }
$expectedHash = 'B2A706BC6AD475749E3B7E3409263AA1E6906D45BDCF993F6DBC0F660188F1AF'
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $monitor).Hash -ne $expectedHash) { throw 'SHA-256 do PresentMon 2.6.0 divergente.' }
$signature = Get-AuthenticodeSignature -LiteralPath $monitor
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=Intel Corporation,') {
  throw 'Assinatura Intel do PresentMon inválida.'
}
if (-not $NodePath) { $NodePath = (Get-Command node.exe -ErrorAction Stop).Source }
$node = [IO.Path]::GetFullPath($NodePath)
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw "Node ausente: $node" }
$nodeProbe = & $node -p 'process.versions.node.slice(0,2)' 2>&1
$nodeExit = $LASTEXITCODE
$nodeMajor = ($nodeProbe | Out-String).Trim()
if ($nodeExit -ne 0 -or $nodeMajor -ne '24') { throw "Node 24 exigido pelo serviço; encontrado: $nodeMajor (exit $nodeExit) em $node" }
$nodeSignature = Get-AuthenticodeSignature -LiteralPath $node
if ($nodeSignature.Status -ne 'Valid' -or $nodeSignature.SignerCertificate.Subject -notmatch 'CN=OpenJS Foundation,') {
  throw 'Assinatura OpenJS do Node 24 inválida.'
}
$command = Join-Path $root 'service/scripts/issue-35-run-profile.mjs'

if ($Describe) {
  [pscustomobject]@{Profiles=$profiles;Seconds=$Seconds;Player=$player;PresentMon=$monitor;SmokeOutput=$smokeOutput;Outputs=$outputs;Status=$statusPath;ElevationError=$elevationErrorPath;Node=$node;Uac='solicitado na execução'} |
    ConvertTo-Json -Depth 2
  return
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  if ($Elevated) { throw 'UAC não concedeu token administrativo.' }
  $quote = { param([string]$value) "'" + $value.Replace("'", "''") + "'" }
  $invoke = "& $(& $quote $PSCommandPath) -Profile $(& $quote $Profile) -OutputPath $(& $quote $output) -PresentMonPath $(& $quote $monitor) -PlayerPath $(& $quote $player) -NodePath $(& $quote $node) -Seconds $Seconds -Elevated"
  $script = 'try { ' + $invoke + ' } catch { $_ | Out-String | Set-Content -LiteralPath ' + (& $quote $elevationErrorPath) + ' -Encoding utf8; exit 1 }'
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList "-NoProfile -EncodedCommand $encoded" -Verb RunAs -WindowStyle Hidden -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Medição elevada falhou ou UAC foi negado (exit $($process.ExitCode)); consulte $elevationErrorPath e $statusPath." }
  return
}

$env:WR3D_PRESENTMON_PATH = $monitor
try {
  if ($smokeOutput) {
    [pscustomobject]@{state='running';profile='visual-smoke';seconds=5;output=$smokeOutput;at=(Get-Date).ToString('o')} |
      ConvertTo-Json -Compress | Set-Content -LiteralPath $statusPath -Encoding utf8
    & $node $command --run visual $player $smokeOutput 5 1> "$smokeOutput.out.txt" 2> "$smokeOutput.err.txt"
    if ($LASTEXITCODE -ne 0) { throw "Smoke visual falhou (exit $LASTEXITCODE). Consulte $smokeOutput." }
  }
  for ($index = 0; $index -lt $profiles.Count; $index++) {
    $item = $profiles[$index]
    $directory = $outputs[$index]
    [pscustomobject]@{state='running';profile=$item;seconds=$Seconds;output=$directory;at=(Get-Date).ToString('o')} |
      ConvertTo-Json -Compress | Set-Content -LiteralPath $statusPath -Encoding utf8
    & $node $command --run $item $player $directory $Seconds 1> "$directory.out.txt" 2> "$directory.err.txt"
    if ($LASTEXITCODE -ne 0) { throw "Perfil $item falhou (exit $LASTEXITCODE). Consulte $directory." }
  }
  [pscustomobject]@{state='complete';profiles=$profiles;at=(Get-Date).ToString('o')} |
    ConvertTo-Json -Compress | Set-Content -LiteralPath $statusPath -Encoding utf8
} catch {
  [pscustomobject]@{state='failed';message=$_.Exception.Message;at=(Get-Date).ToString('o')} |
    ConvertTo-Json -Compress | Set-Content -LiteralPath $statusPath -Encoding utf8
  throw
}
