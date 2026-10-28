<#
.SYNOPSIS
  Publica o BenHeimdall pela Cloudflare (Cloudflare Tunnel), sem abrir porta no roteador.

.DESCRIPTION
  O túnel é um serviço do Windows chamado "cloudflared", e cada PC tem UM. Se o BenURA já
  instalou o dele neste PC, o BenHeimdall usa o MESMO túnel: basta acrescentar um Public
  Hostname no painel da Cloudflare. Este script NUNCA troca um túnel que já existe (isso
  derrubaria o BenURA), a não ser com -Substituir.

  Sem túnel neste PC:
  1. Instala o cloudflared (winget), se ainda não houver.
  2. Pede o token do túnel sem mostrar na tela (ou recebe em -Token) e instala o serviço.
  Nos dois casos, confere se o BenHeimdall responde no localhost e mostra o que falta no painel.

.PARAMETER Token
  Token do túnel (Zero Trust → Networks → Tunnels → <túnel> → Install connector: o texto longo
  depois de "service install"). Sem ele, o script pergunta (só quando for instalar).

.PARAMETER Substituir
  Troca o túnel que já existe neste PC pelo do -Token. Cuidado: se for o do BenURA, ele sai do ar.

.EXAMPLE
  # No PowerShell como administrador, na pasta do BenHeimdall:
  npm run tunel:instalar
#>
[CmdletBinding()]
param(
  [string]$Pasta = (Resolve-Path ([IO.Path]::Combine($PSScriptRoot, '..', '..'))).Path,
  [string]$Token,
  [switch]$Substituir
)

$ErrorActionPreference = 'Stop'
function Passo([string]$texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
function Falhar([string]$texto) { Write-Host "`nERRO: $texto" -ForegroundColor Red; exit 1 }

Passo 'Conferindo o PC'
$identidade = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identidade.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Falhar 'Abra o PowerShell como administrador (botão direito → "Executar como administrador") e rode de novo.'
}
$porta = 3020
$env_ = Join-Path $Pasta '.env'
if (Test-Path $env_) {
  $m = Select-String -Path $env_ -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
  if ($m) { $porta = [int]$m.Matches[0].Groups[1].Value }
}
$destino = "http://localhost:$porta"

$existente = Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue
if ($existente -and -not $Substituir) {
  Passo 'Túnel já instalado neste PC'
  Write-Host "Já existe o serviço ""cloudflared"" ($($existente.Status)). Provavelmente é o túnel do BenURA:" -ForegroundColor Green
  Write-Host 'o BenHeimdall usa o mesmo túnel. Não mexi em nada.'
} else {
  Passo 'cloudflared'
  $cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
  if (-not $cloudflared) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
      Falhar 'winget não encontrado. Baixe o cloudflared em https://github.com/cloudflare/cloudflared/releases (cloudflared-windows-amd64.msi), instale e rode de novo.'
    }
    Write-Host 'Instalando o cloudflared (winget)...'
    winget install --id Cloudflare.cloudflared --exact --accept-source-agreements --accept-package-agreements --silent
    # O winget não atualiza o PATH desta janela: procura onde ele instala.
    $candidatos = @(
      (Join-Path ${env:ProgramFiles(x86)} 'cloudflared\cloudflared.exe'),
      (Join-Path $env:ProgramFiles 'cloudflared\cloudflared.exe')
    )
    $cloudflared = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $cloudflared) { Falhar 'O cloudflared foi instalado, mas não achei o executável. Feche e abra o PowerShell (como administrador) e rode de novo.' }
  }
  Write-Host "cloudflared: $cloudflared ($((& $cloudflared --version 2>&1 | Out-String).Trim()))"

  Passo 'Token do túnel'
  if (-not $Token) {
    Write-Host 'Cole o token do túnel (Zero Trust → Networks → Tunnels → <túnel> → Install connector:'
    Write-Host 'é o texto longo que vem depois de "cloudflared.exe service install"). Ele não aparece na tela.'
    $seguro = Read-Host -AsSecureString 'Token'
    $Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro))
  }
  $Token = $Token.Trim()
  # Quem copiar o comando inteiro ("cloudflared.exe service install eyJ..."): fica só o token.
  if ($Token -match '\s') { $Token = ($Token -split '\s+')[-1] }
  if ($Token.Length -lt 50) { Falhar 'Esse token parece curto demais. Copie o texto longo que o painel da Cloudflare mostra (começa com "eyJ").' }

  Passo 'Serviço do Windows "cloudflared"'
  if ($existente) {
    Write-Warning 'Substituindo o túnel que já existia neste PC (-Substituir).'
    & $cloudflared service uninstall 2>&1 | Out-Host
    Start-Sleep -Seconds 2
  }
  & $cloudflared service install $Token 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Falhar 'O cloudflared não conseguiu instalar o serviço (veja acima).' }
  $Token = $null

  $servico = $null
  for ($i = 0; $i -lt 15; $i++) {
    $servico = Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue
    if ($servico -and $servico.Status -eq 'Running') { break }
    Start-Sleep -Seconds 1
  }
  if (-not $servico -or $servico.Status -ne 'Running') { Falhar 'O serviço cloudflared não ficou rodando. Veja em services.msc ou no Visualizador de Eventos.' }
  Write-Host 'Serviço cloudflared rodando (sobe sozinho com o Windows).' -ForegroundColor Green
}

Passo 'BenHeimdall neste servidor'
try {
  $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri "$destino/health"
  Write-Host "BenHeimdall respondendo em $destino (HTTP $($r.StatusCode)): o túnel vai levar até ele." -ForegroundColor Green
} catch {
  Write-Warning "O BenHeimdall não respondeu em $destino. Suba-o antes (npm run servico:instalar)."
}

Passo 'Falta no painel da Cloudflare (Zero Trust → Networks → Tunnels → <túnel> → Public Hostname)'
Write-Host "  Add a public hostname:  heimdall.benconsig.com.br  →  Service: HTTP  →  URL: localhost:$porta"
Write-Host '  (o nome é sugestão; WebSocket já vem ligado no túnel)'
Write-Host '  No .env: NODE_ENV=production e TRUST_PROXY=loopback (padrão). Depois: npm run servico:instalar'
Write-Host '  Recomendado: regra de WAF ou Cloudflare Access liberando só os IPs de IPS_PERMITIDOS.'
Write-Host 'Conferir depois: npm run servico:verificar'
