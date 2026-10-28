<#
.SYNOPSIS
  Vigia do BenHeimdall (roda pela tarefa "BenHeimdall" do Agendador): ao ligar o PC e a cada 5 min.
  Se o "benheimdall" não está no PM2, sobe de novo (pm2 startOrRestart ecosystem.config.cjs).
  Se está na lista mas parado de propósito (npm run pm2:parar), continua parado.
  Não mexe nos serviços do BenURA. Anota o que fez em logs\servico-windows.log.
#>
[CmdletBinding()]
param([string]$Pasta = (Resolve-Path ([IO.Path]::Combine($PSScriptRoot, '..', '..'))).Path)

# 'Continue': no PowerShell 5.1, saída de erro de programa redirecionada com 'Stop' vira exceção.
$ErrorActionPreference = 'Continue'
$logs = Join-Path $Pasta 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$registro = Join-Path $logs 'servico-windows.log'
function Anotar([string]$texto) { Add-Content -Path $registro -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $texto" -Encoding UTF8 }

try {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { $node = Join-Path $env:ProgramFiles 'nodejs\node.exe' }
  $pm2 = [IO.Path]::Combine($Pasta, 'node_modules', 'pm2', 'bin', 'pm2')
  Set-Location $Pasta

  # O jlist sobe o PM2 se ele não estiver de pé (aí vem vazio).
  $estado = [IO.Path]::Combine($Pasta, 'scripts', 'windows', 'pm2-estado.cjs')
  $linhas = @(& $node $estado $Pasta 2>&1 | ForEach-Object { "$_" })
  if ($LASTEXITCODE -ne 0) { Anotar "PM2 não respondeu: $($linhas -join ' ')"; exit 1 }
  if ($linhas.Count -gt 0) { exit 0 }

  Anotar 'PM2 sem o benheimdall: subindo de novo (pm2 startOrRestart ecosystem.config.cjs).'
  $resultado = & $node $pm2 startOrRestart ecosystem.config.cjs --env production 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { Anotar "pm2 startOrRestart falhou: $($resultado.Trim())"; exit 1 }
  & $node $pm2 save --force 2>&1 | Out-Null
  Anotar 'BenHeimdall de volta no PM2.'
} catch {
  Anotar "Vigia falhou: $($_.Exception.Message)"
  exit 1
}
