<#
.SYNOPSIS
  Instala o BenHeimdall como serviço do Windows: sobe sozinho quando o PC liga, mesmo sem
  ninguém logado, e volta sozinho se o PM2 cair. Mesmo modelo do BenURA.

.DESCRIPTION
  1. Confere o .env (gera um SESSION_SECRET de verdade se ainda estiver o do exemplo).
  2. Compila (npm run build), sobe o "benheimdall" no PM2 e salva a lista (pm2 save).
  3. Cria a tarefa "BenHeimdall" no Agendador de Tarefas, com o usuário do Windows (pede a senha):
     - ao ligar o PC (1 min depois) e a cada 5 min (o vigia): se o BenHeimdall sumiu do PM2, sobe de novo.
  O PM2 é o mesmo do BenURA neste PC: este script só mexe no processo "benheimdall".
  Pode rodar de novo quando quiser (atualiza a tarefa, não duplica nada).

.PARAMETER SemVigia
  Só sobe ao ligar o PC (sem a conferência a cada 5 min).

.EXAMPLE
  # No PowerShell como administrador, na pasta do BenHeimdall:
  npm run servico:instalar
#>
[CmdletBinding()]
param(
  [string]$Pasta = (Resolve-Path ([IO.Path]::Combine($PSScriptRoot, '..', '..'))).Path,
  [switch]$SemVigia
)

$ErrorActionPreference = 'Stop'
$NomeTarefa = 'BenHeimdall'
function Passo([string]$texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
function Falhar([string]$texto) { Write-Host "`nERRO: $texto" -ForegroundColor Red; exit 1 }

Passo 'Conferindo o PC'
$identidade = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identidade.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Falhar 'Abra o PowerShell como administrador (botão direito → "Executar como administrador") e rode de novo.'
}
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Falhar 'Node.js não encontrado. Instale com: winget install OpenJS.NodeJS.LTS (e abra o PowerShell de novo).' }
$pm2 = [IO.Path]::Combine($Pasta, 'node_modules', 'pm2', 'bin', 'pm2')
if (-not (Test-Path $pm2)) { Falhar "PM2 não encontrado em $pm2. Rode 'npm ci' na pasta $Pasta." }
Write-Host "Pasta do BenHeimdall: $Pasta"
Write-Host "Node: $node ($(& $node -v))"

Passo 'Conferindo o .env'
$env_ = Join-Path $Pasta '.env'
if (-not (Test-Path $env_)) {
  Copy-Item (Join-Path $Pasta '.env.example') $env_
  Write-Warning 'Não havia .env: criei a partir do .env.example. Revise IPS_PERMITIDOS, TV_ALLOWED_IPS e ADMIN_SENHA_INICIAL.'
}
$conteudo = Get-Content $env_ -Raw -Encoding UTF8
if ($conteudo -match '(?m)^SESSION_SECRET=troque-este-segredo') {
  # Segredo do exemplo não serve em produção: troca por 48 bytes aleatórios.
  $bytes = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $segredo = [Convert]::ToBase64String($bytes)
  $conteudo = $conteudo -replace '(?m)^SESSION_SECRET=.*$', "SESSION_SECRET=$segredo"
  [IO.File]::WriteAllText($env_, $conteudo, (New-Object Text.UTF8Encoding $false))
  Write-Host 'SESSION_SECRET do exemplo trocado por um segredo aleatório.' -ForegroundColor Green
}

Passo 'Compilando (npm run build)'
Push-Location $Pasta
try {
  & npm run build
  if ($LASTEXITCODE -ne 0) { Falhar 'A compilação falhou (veja acima).' }

  Passo 'Subindo o benheimdall no PM2'
  & $node $pm2 startOrRestart ecosystem.config.cjs --env production
  if ($LASTEXITCODE -ne 0) { Falhar 'O PM2 não conseguiu subir o BenHeimdall (veja acima).' }
  # A lista salva (inclui os serviços do BenURA, se houver) é o que o pm2 resurrect devolve.
  & $node $pm2 save --force
  if ($LASTEXITCODE -ne 0) { Falhar 'O PM2 não conseguiu salvar a lista de serviços.' }
} finally {
  Pop-Location
}

Passo "Criando a tarefa ""$NomeTarefa"" no Agendador de Tarefas"
$usuario = "$env:USERDOMAIN\$env:USERNAME"
Write-Host "A tarefa roda como $usuario (o mesmo usuário do PM2 e do BenURA neste PC)."
$credencial = Get-Credential -UserName $usuario -Message 'Senha deste usuário do Windows: o BenHeimdall sobe com ele mesmo sem ninguém logado'
if (-not $credencial) { Falhar 'Sem a senha não dá para criar a tarefa.' }

$vigia = [IO.Path]::Combine($Pasta, 'scripts', 'windows', 'vigia-pm2.ps1')
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $Pasta `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$vigia`" -Pasta `"$Pasta`""
$aoLigar = New-ScheduledTaskTrigger -AtStartup
$aoLigar.Delay = 'PT1M' # a rede e o disco já estão prontos
$gatilhos = @($aoLigar)
if (-not $SemVigia) {
  $gatilhos += New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 5)
}
$opcoes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

try {
  Register-ScheduledTask -TaskName $NomeTarefa -Action $acao -Trigger $gatilhos -Settings $opcoes `
    -User $usuario -Password $credencial.GetNetworkCredential().Password -RunLevel Highest -Force `
    -Description 'BenHeimdall: sobe o painel no PM2 ao ligar o PC e confere a cada 5 min (scripts\windows\vigia-pm2.ps1).' | Out-Null
} catch {
  Falhar "O Windows não aceitou criar a tarefa: $($_.Exception.Message) (senha errada?)"
}

Passo 'Pronto'
Write-Host "O BenHeimdall agora sobe sozinho com o Windows (tarefa ""$NomeTarefa"")." -ForegroundColor Green
Write-Host '  Conferir:      npm run servico:verificar'
Write-Host '  Ver os logs:   npm run pm2:logs   (e logs\servico-windows.log, do vigia)'
Write-Host '  Atualizar:     git pull; npm ci; npm run servico:instalar'
Write-Host '  Túnel:         npm run tunel:instalar   (como administrador)'
Write-Host '  Desinstalar:   npm run servico:desinstalar   (como administrador)'
