<#
.SYNOPSIS
  Mostra como está o BenHeimdall neste PC: a tarefa do Windows, o processo no PM2, se responde
  no /health e o túnel da Cloudflare. Não muda nada.
#>
[CmdletBinding()]
param([string]$Pasta = (Resolve-Path ([IO.Path]::Combine($PSScriptRoot, '..', '..'))).Path)

$ErrorActionPreference = 'Continue'
function Titulo([string]$texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }
function Ok([string]$texto) { Write-Host "  [ok] $texto" -ForegroundColor Green }
function Ruim([string]$texto) { Write-Host "  [!!] $texto" -ForegroundColor Yellow }

# Porta do .env (padrão 3020).
$porta = 3020
$env_ = Join-Path $Pasta '.env'
if (Test-Path $env_) {
  $m = Select-String -Path $env_ -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
  if ($m) { $porta = [int]$m.Matches[0].Groups[1].Value }
} else {
  Ruim "não achei o .env em $Pasta"
}

Titulo 'Início automático (Agendador de Tarefas)'
$tarefa = Get-ScheduledTask -TaskName 'BenHeimdall' -ErrorAction SilentlyContinue
if ($tarefa) {
  $info = Get-ScheduledTaskInfo -TaskName 'BenHeimdall'
  Ok "tarefa ""BenHeimdall"": $($tarefa.State), roda como $($tarefa.Principal.UserId)"
  Write-Host "  última vez: $($info.LastRunTime) (resultado $($info.LastTaskResult)); próxima: $($info.NextRunTime)"
} else {
  Ruim 'a tarefa "BenHeimdall" não existe: não sobe sozinho com o Windows (npm run servico:instalar, como administrador).'
}

Titulo 'PM2'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
$pm2 = [IO.Path]::Combine($Pasta, 'node_modules', 'pm2', 'bin', 'pm2')
if (-not $node -or -not (Test-Path $pm2)) {
  Ruim 'Node.js ou PM2 não encontrado (rode npm ci).'
} else {
  $estado = [IO.Path]::Combine($Pasta, 'scripts', 'windows', 'pm2-estado.cjs')
  $linhas = @(& $node $estado $Pasta 2>&1 | ForEach-Object { "$_" })
  if ($LASTEXITCODE -ne 0) { Ruim "o PM2 não respondeu: $($linhas -join ' ')" }
  elseif (-not $linhas.Count) { Ruim 'o benheimdall não está no PM2 (npm run servico:instalar).' }
  else {
    foreach ($l in $linhas) {
      $nome, $status, $reinicios = $l -split "`t"
      $texto = "${nome}: $status (reinícios: $reinicios)"
      if ($status -eq 'online') { Ok $texto } else { Ruim $texto }
    }
  }
}

Titulo 'Respondendo no /health'
$url = "http://localhost:$porta/health"
try {
  $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $url
  $saude = $r.Content | ConvertFrom-Json
  Ok "BenHeimdall ($url): HTTP $($r.StatusCode)"
  if ($saude.argus.online) { Ok "Argus ($($saude.argus.modo)): conectada" } else { Ruim "Argus ($($saude.argus.modo)): sem conexão — $($saude.argus.ultimoErro)" }
} catch {
  Ruim "BenHeimdall ($url): não respondeu"
}

Titulo 'Túnel (Cloudflare)'
$cloudflared = Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue
if ($cloudflared) {
  if ($cloudflared.Status -eq 'Running') { Ok 'cloudflared: rodando (serviço do Windows, o mesmo túnel do BenURA se ele estiver neste PC)' }
  else { Ruim "cloudflared: $($cloudflared.Status)" }
  Write-Host "  Confira no painel Zero Trust se há um Public Hostname apontando para http://localhost:$porta."
} else {
  Write-Host '  cloudflared: não instalado (npm run tunel:instalar, como administrador).'
}
