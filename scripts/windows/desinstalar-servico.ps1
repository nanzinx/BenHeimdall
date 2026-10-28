<#
.SYNOPSIS
  Tira o BenHeimdall do início automático do Windows (remove a tarefa "BenHeimdall").
  O processo que está rodando agora continua; para parar também, use -PararServicos.
  Só mexe no "benheimdall": os serviços do BenURA no mesmo PM2 continuam como estão.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\windows\desinstalar-servico.ps1 -PararServicos
#>
[CmdletBinding()]
param(
  [string]$Pasta = (Resolve-Path ([IO.Path]::Combine($PSScriptRoot, '..', '..'))).Path,
  [switch]$PararServicos
)

$ErrorActionPreference = 'Stop'
$identidade = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identidade.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'ERRO: abra o PowerShell como administrador e rode de novo.' -ForegroundColor Red
  exit 1
}

if (Get-ScheduledTask -TaskName 'BenHeimdall' -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName 'BenHeimdall' -Confirm:$false
  Write-Host 'Tarefa "BenHeimdall" removida: não sobe mais sozinho com o Windows.' -ForegroundColor Green
} else {
  Write-Host 'A tarefa "BenHeimdall" não existe (nada a remover).'
}

if ($PararServicos) {
  $node = (Get-Command node).Source
  $pm2 = [IO.Path]::Combine($Pasta, 'node_modules', 'pm2', 'bin', 'pm2')
  Push-Location $Pasta
  try {
    # Só o benheimdall (nunca "delete all": o PM2 é compartilhado com o BenURA).
    & $node $pm2 delete benheimdall
    & $node $pm2 save --force
  } finally {
    Pop-Location
  }
  Write-Host 'BenHeimdall parado e retirado da lista do PM2.' -ForegroundColor Green
}
