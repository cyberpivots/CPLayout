param(
  [int]$TargetProcessId = 0,
  [string]$GoogleEarthPath = "C:\Program Files\Google\Google Earth Pro\client\googleearth.exe",
  [string]$OutputRecordPath = "",
  [int]$CleanupTimeoutSeconds = 10,
  [switch]$DisableForceCleanup,
  [switch]$InventoryOnly,
  [switch]$Strict
)

$ErrorActionPreference = "Stop"

function Convert-ToWindowsPath([string]$Path) {
  $resolved = Resolve-Path -LiteralPath $Path -ErrorAction SilentlyContinue
  if ($resolved) {
    $Path = $resolved.Path
  }
  if ($Path -match "^/mnt/([a-z])/(.*)$") {
    $drive = $matches[1].ToUpperInvariant()
    $tail = $matches[2] -replace "/", "\"
    return "${drive}:\$tail"
  }
  return $Path
}

function Get-TargetGoogleEarthProcess([int]$ProcessId, [string]$Path) {
  if ($ProcessId -gt 0) {
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $process) {
      return $null
    }
    if ($process.ProcessName -ne "googleearth") {
      throw "Target process $ProcessId is $($process.ProcessName), not googleearth."
    }
    return $process
  }

  $expectedPath = $Path
  if (-not $IsLinux) {
    $expectedPath = Convert-ToWindowsPath $expectedPath
  }
  $processes = @(Get-Process -Name "googleearth" -ErrorAction SilentlyContinue)
  if ($processes.Count -eq 0) {
    return $null
  }

  $matching = @($processes | Where-Object {
    try {
      $_.Path -eq $expectedPath
    } catch {
      $false
    }
  })
  if ($matching.Count -gt 0) {
    return $matching | Sort-Object StartTime | Select-Object -First 1
  }
  return $processes | Sort-Object StartTime | Select-Object -First 1
}

function Get-ProcessInventory($Process) {
  if (-not $Process) {
    return $null
  }
  try {
    $Process.Refresh()
  } catch {
  }
  $processPath = $null
  $responding = $null
  $startTime = $null
  try {
    $processPath = $Process.Path
  } catch {
  }
  try {
    $responding = $Process.Responding
  } catch {
  }
  try {
    $startTime = $Process.StartTime.ToUniversalTime().ToString("o")
  } catch {
  }
  return [pscustomobject]@{
    id = $Process.Id
    processName = $Process.ProcessName
    mainWindowTitle = $Process.MainWindowTitle
    path = $processPath
    responding = $responding
    startTime = $startTime
  }
}

function Initialize-UiAutomation {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
}

function Invoke-DiscardModalButton([int]$ProcessId) {
  Initialize-UiAutomation
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $processCondition = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::ProcessIdProperty), $ProcessId
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $processCondition)
  $discardPatterns = @(
    "^Discard$",
    "^Don'?t Save$",
    "^Don.t Save$",
    "^No$",
    "close without saving",
    "exit without saving",
    "quit without saving",
    "discard changes"
  )

  for ($windowIndex = 0; $windowIndex -lt $windows.Count; $windowIndex++) {
    $window = $windows.Item($windowIndex)
    $buttonCondition = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::ControlTypeProperty), ([System.Windows.Automation.ControlType]::Button)
    $buttons = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
    for ($buttonIndex = 0; $buttonIndex -lt $buttons.Count; $buttonIndex++) {
      $button = $buttons.Item($buttonIndex)
      $name = $button.Current.Name
      if ([string]::IsNullOrWhiteSpace($name)) {
        continue
      }
      foreach ($pattern in $discardPatterns) {
        if ($name -match $pattern) {
          $invokePattern = $null
          if ($button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invokePattern)) {
            $invokePattern.Invoke()
            return [pscustomobject]@{
              handled = $true
              buttonName = $name
              windowTitle = $window.Current.Name
              handledAt = (Get-Date).ToUniversalTime().ToString("o")
            }
          }
        }
      }
    }
  }

  return [pscustomobject]@{
    handled = $false
    buttonName = $null
    windowTitle = $null
    handledAt = $null
  }
}

function Test-ProcessRunning([int]$ProcessId) {
  return $null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

$target = Get-TargetGoogleEarthProcess -ProcessId $TargetProcessId -Path $GoogleEarthPath
$inventory = Get-ProcessInventory -Process $target
$preflightProcessPresent = $null -ne $inventory
$modalResult = [pscustomobject]@{
  handled = $false
  buttonName = $null
  windowTitle = $null
  handledAt = $null
}
$closeMethod = "none"
$forceUsed = $false
$status = "not_requested"
$errorMessage = $null

if ($InventoryOnly) {
  if ($target) {
    $status = "inventory_found_target"
  } else {
    $status = "clean"
  }
} elseif (-not $target) {
  $status = "closed_gracefully"
  $closeMethod = "already_closed"
} else {
  try {
    $closeMethod = "close_main_window"
    $closed = $target.CloseMainWindow()
    if (-not $closed) {
      $errorMessage = "CloseMainWindow returned false."
    }

    $deadline = (Get-Date).AddSeconds([Math]::Max(1, $CleanupTimeoutSeconds))
    while ((Get-Date) -lt $deadline -and (Test-ProcessRunning -ProcessId $target.Id)) {
      $candidateModal = Invoke-DiscardModalButton -ProcessId $target.Id
      if ($candidateModal.handled) {
        $modalResult = $candidateModal
      }
      Start-Sleep -Milliseconds 500
    }

    if (-not (Test-ProcessRunning -ProcessId $target.Id)) {
      if ($modalResult.handled) {
        $status = "closed_after_modal_discard"
        $closeMethod = "close_main_window_modal_discard"
      } else {
        $status = "closed_gracefully"
      }
    } elseif (-not $DisableForceCleanup) {
      Stop-Process -Id $target.Id -Force -ErrorAction Stop
      $forceUsed = $true
      Start-Sleep -Milliseconds 500
      if (Test-ProcessRunning -ProcessId $target.Id) {
        $status = "blocked"
        $errorMessage = "Target process still running after force-close."
      } else {
        $status = "force_closed"
        $closeMethod = "force_stop_process"
      }
    } else {
      $status = "blocked"
      if ([string]::IsNullOrWhiteSpace($errorMessage)) {
        $errorMessage = "Target process still running after graceful close; force cleanup disabled."
      }
    }
  } catch {
    $status = "blocked"
    $errorMessage = $_.Exception.Message
  }
}

$targetProcessId = if ($inventory) { $inventory.id } elseif ($TargetProcessId -gt 0) { $TargetProcessId } else { $null }
$postflightProcess = if ($targetProcessId) { Get-Process -Id $targetProcessId -ErrorAction SilentlyContinue } else { $null }
$postflightInventory = Get-ProcessInventory -Process $postflightProcess
$postflightProcessRemaining = $null -ne $postflightInventory
$cleanupRequired = [bool]((-not [bool]$InventoryOnly) -and $preflightProcessPresent)
$contaminated = [bool]((-not [bool]$InventoryOnly) -and ($postflightProcessRemaining -or $status -eq "blocked"))
$failureReason = $null
if ($contaminated) {
  if ($postflightProcessRemaining) {
    $failureReason = "Target Google Earth Pro process remains after cleanup."
  } elseif (-not [string]::IsNullOrWhiteSpace($errorMessage)) {
    $failureReason = $errorMessage
  } else {
    $failureReason = "Google Earth Pro cleanup was blocked."
  }
} elseif ($Strict -and $InventoryOnly -and $preflightProcessPresent) {
  $failureReason = "Inventory-only preflight found a Google Earth Pro process; no cleanup was attempted."
}

$record = [pscustomobject]@{
  schemaVersion = "cplayout-google-earth-cleanup-v1"
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  requested = -not [bool]$InventoryOnly
  inventoryOnly = [bool]$InventoryOnly
  strict = [bool]$Strict
  targetProcessId = $targetProcessId
  preflightProcessPresent = [bool]$preflightProcessPresent
  postflightProcessRemaining = [bool]$postflightProcessRemaining
  cleanupRequired = [bool]$cleanupRequired
  contaminated = [bool]$contaminated
  failureReason = $failureReason
  target = $inventory
  postflightTarget = $postflightInventory
  closeMethod = $closeMethod
  modalHandled = [bool]$modalResult.handled
  modal = $modalResult
  forceUsed = [bool]$forceUsed
  status = $status
  error = $errorMessage
  verifiedProcessRemaining = [bool]$postflightProcessRemaining
}

if (-not [string]::IsNullOrWhiteSpace($OutputRecordPath)) {
  $outputPath = if ($IsLinux) { $OutputRecordPath } else { Convert-ToWindowsPath $OutputRecordPath }
  $parent = Split-Path -Parent $outputPath
  if (-not [string]::IsNullOrWhiteSpace($parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outputPath -Encoding UTF8
}

$record | ConvertTo-Json -Depth 8
