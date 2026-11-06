# Genera cards.json a partire da tools/cards.csv e dalle immagini nelle cartelle di Data/.
# Da eseguire (PowerShell) ogni volta che si modifica tools/cards.csv o si spostano/aggiungono immagini:
#   powershell -ExecutionPolicy Bypass -File tools\build-cards.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

# "Aether Shock" e "Aether_Shock.jpg" devono dare la stessa chiave
function Get-Key([string]$s) { ($s -replace '[^A-Za-z0-9]+', '_').Trim('_').ToLower() }

# Divide il testo dell'effetto nelle sue parti (TO DISCARD, IMMEDIATELY, PERSISTENT, POWER n)
function Split-Effect([string]$text) {
  $parts = [ordered]@{ toDiscard = $null; immediately = $null; persistent = $null; powerEffect = $null }
  $found = [regex]::Matches($text, '(?m)^(TO DISCARD|IMMEDIATELY|PERSISTENT|POWER \d+):[ \t]*')
  for ($i = 0; $i -lt $found.Count; $i++) {
    $start = $found[$i].Index + $found[$i].Length
    $end = if ($i + 1 -lt $found.Count) { $found[$i + 1].Index } else { $text.Length }
    $body = ($text.Substring($start, $end - $start).Trim()) -replace '\s*\n\s*', ' '
    switch -Regex ($found[$i].Groups[1].Value) {
      '^TO DISCARD$' { $parts.toDiscard = $body }
      '^IMMEDIATELY$' { $parts.immediately = $body }
      '^PERSISTENT$' { $parts.persistent = $body }
      '^POWER' { $parts.powerEffect = $body }
    }
  }
  return $parts
}

$dataRoot = (Resolve-Path 'Data').Path
$images = @{}
Get-ChildItem -LiteralPath $dataRoot -Recurse -File |
  Where-Object { $_.Extension -match '^\.(png|jpe?g)$' } |
  ForEach-Object {
    $key = Get-Key $_.BaseName
    if ($images.ContainsKey($key)) { throw "Due immagini con lo stesso nome: $key" }
    $images[$key] = $_
  }

$rows = Import-Csv -LiteralPath 'tools\cards.csv' -Encoding UTF8
$used = @{}
$cards = foreach ($r in $rows) {
  $key = Get-Key $r.Name
  if (-not $images.ContainsKey($key)) { throw "Nessuna immagine per la carta: $($r.Name)" }
  $file = $images[$key]
  $used[$key] = $true

  # Percorso relativo, es. Data/Arachnos/Tier_1/Bolster.jpg
  $rel = $file.FullName.Substring($dataRoot.Length + 1).Replace('\', '/')
  $folders = $rel.Split('/')[0..($rel.Split('/').Count - 2)]   # cartelle senza il nome del file

  # Tier e nemico: nel CSV la colonna Tier/Nemesis contiene o "Tier N" o il nome del nemico
  $tier = $null; $nemesis = $null; $subgroup = $null
  if ($r.'Tier/Nemesis' -match '^Tier (\d)$') {
    $tier = [int]$Matches[1]
  } else {
    $nemesis = $r.'Tier/Nemesis'
    if ($folders.Count -gt 1 -and $folders[1] -match '^Tier_(\d)$') { $tier = [int]$Matches[1] }
  }
  if ($folders.Count -gt 1 -and $folders[1] -notmatch '^Tier_\d$') { $subgroup = $folders[1] }
  if ($tier -and $folders.Count -gt 1 -and $folders[1] -match '^Tier_(\d)$' -and [int]$Matches[1] -ne $tier) {
    Write-Warning "Tier diverso tra CSV e cartella: $($r.Name)"
  }

  # Copie: un ID con intervallo (NA-3a-06 - NA-3a-09) indica piu' copie della stessa carta
  $id = $r.ID; $qty = 1
  if ($r.ID -match '^(.*?)(\d+)\s+-\s+(.*?)(\d+)$') {
    $id = $Matches[1] + $Matches[2]
    $qty = [int]$Matches[4] - [int]$Matches[2] + 1
  }

  $effect = ($r.Effect -replace "`r", '').Trim()
  $parts = Split-Effect $effect

  [ordered]@{
    id          = $id
    name        = $r.Name
    category    = $r.Category
    nemesis     = $nemesis
    tier        = $tier
    subgroup    = $subgroup
    type        = $r.Type
    hp          = if ($r.Hp -match '^\d+$') { [int]$r.Hp } else { $null }
    hpVariable  = ($r.Hp -eq '*')
    tokens      = if ($r.Power -match '^\d+$') { [int]$r.Power } else { $null }
    qty         = $qty
    effect      = $effect
    toDiscard   = $parts.toDiscard
    immediately = $parts.immediately
    persistent  = $parts.persistent
    powerEffect = $parts.powerEffect
    image       = "Data/$rel"
  }
}

foreach ($key in $images.Keys) {
  if (-not $used.ContainsKey($key)) { Write-Warning "Immagine senza riga nel CSV: $($images[$key].Name)" }
}

$json = ConvertTo-Json -InputObject @($cards) -Depth 4
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'cards.json'), $json + "`n", (New-Object System.Text.UTF8Encoding $false))
Write-Host "cards.json: $(@($cards).Count) carte"
