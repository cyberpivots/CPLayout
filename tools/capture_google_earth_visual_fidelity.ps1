param(
  [string]$GoogleEarthPath = "C:\Program Files\Google\Google Earth Pro\client\googleearth.exe",
  [string]$OutputDir = "reports\google-earth-visual-fidelity",
  [ValidateSet("kmz", "kml")]
  [string]$OpenArtifact = "kmz",
  [int]$StartupSeconds = 10,
  [int]$RenderSeconds = 18,
  [double]$MinimumNonBlackRatio = 0.08,
  [double]$MinimumGrayVariance = 80,
  [switch]$GenerateOnly,
  [switch]$ConfirmOverlayVisible,
  [switch]$RequireProofPass
)

$ErrorActionPreference = "Stop"

$signature = @"
using System;
using System.Runtime.InteropServices;

public static class WindowApi {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out Rect lpRect);

  [StructLayout(LayoutKind.Sequential)]
  public struct Rect {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
"@

function Initialize-WindowsCaptureAssemblies {
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -TypeDefinition $signature
}

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

function Convert-ToWslPath([string]$Path) {
  if ($Path -match "^([a-zA-Z]):[\\/](.*)$") {
    $drive = $matches[1].ToLowerInvariant()
    $tail = $matches[2] -replace "\\", "/"
    return "/mnt/$drive/$tail"
  }
  return $Path
}

function Quote-BashPath([string]$Path) {
  return "'" + ($Path -replace "'", "'\''") + "'"
}

function Convert-ToRepoRelativePath([string]$Path, [string]$RepoRoot) {
  $resolvedPath = [System.IO.Path]::GetFullPath($Path)
  $resolvedRoot = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  if ($resolvedPath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $resolvedPath.Substring($resolvedRoot.Length).TrimStart([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  }
  return $resolvedPath
}

function Get-GoogleEarthProcess([string]$Path) {
  $process = Get-Process -Name "googleearth" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($process) {
    return $process
  }
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Google Earth Pro was not found at $Path"
  }
  Start-Process -FilePath $Path | Out-Null
  Start-Sleep -Seconds $StartupSeconds
  return Get-Process -Name "googleearth" -ErrorAction Stop | Select-Object -First 1
}

function Wait-ForMainWindow($Process) {
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $Process.Refresh()
    if ($Process.MainWindowHandle -ne [IntPtr]::Zero) {
      return $Process.MainWindowHandle
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Google Earth Pro did not expose a main window handle."
}

function Get-WindowBounds([IntPtr]$Handle) {
  $rect = New-Object WindowApi+Rect
  if (-not [WindowApi]::GetWindowRect($Handle, [ref]$rect)) {
    throw "Could not read Google Earth Pro window bounds."
  }
  return [pscustomobject]@{
    left = $rect.Left
    top = $rect.Top
    width = [Math]::Max(1, $rect.Right - $rect.Left)
    height = [Math]::Max(1, $rect.Bottom - $rect.Top)
  }
}

function Capture-Window([IntPtr]$Handle, [string]$Path, [System.Drawing.Rectangle]$Crop) {
  [WindowApi]::ShowWindow($Handle, 3) | Out-Null
  [WindowApi]::SetForegroundWindow($Handle) | Out-Null
  Start-Sleep -Milliseconds 750

  $bounds = Get-WindowBounds -Handle $Handle
  $captureRect = New-Object System.Drawing.Rectangle 0, 0, $bounds.width, $bounds.height
  if ($Crop.Width -gt 0 -and $Crop.Height -gt 0) {
    $captureRect = [System.Drawing.Rectangle]::Intersect($captureRect, $Crop)
    if ($captureRect.Width -le 0 -or $captureRect.Height -le 0) {
      throw "Requested crop falls outside the Google Earth Pro window bounds."
    }
  }

  $bitmap = New-Object System.Drawing.Bitmap $captureRect.Width, $captureRect.Height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($bounds.left + $captureRect.X, $bounds.top + $captureRect.Y, 0, 0, $bitmap.Size)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }

  return [pscustomobject]@{
    x = $captureRect.X
    y = $captureRect.Y
    width = $captureRect.Width
    height = $captureRect.Height
  }
}

function Analyze-Image([string]$Path) {
  $bitmap = [System.Drawing.Bitmap]::FromFile($Path)
  try {
    $stepX = [Math]::Max(1, [Math]::Floor($bitmap.Width / 600))
    $stepY = [Math]::Max(1, [Math]::Floor($bitmap.Height / 450))
    $sampleCount = 0
    $nonBlackCount = 0
    $sum = 0.0
    $sumSquares = 0.0
    $minGray = 255
    $maxGray = 0

    for ($y = 0; $y -lt $bitmap.Height; $y += $stepY) {
      for ($x = 0; $x -lt $bitmap.Width; $x += $stepX) {
        $pixel = $bitmap.GetPixel($x, $y)
        $gray = (0.299 * $pixel.R) + (0.587 * $pixel.G) + (0.114 * $pixel.B)
        $sampleCount += 1
        $sum += $gray
        $sumSquares += ($gray * $gray)
        $minGray = [Math]::Min($minGray, [int][Math]::Round($gray))
        $maxGray = [Math]::Max($maxGray, [int][Math]::Round($gray))
        if ($pixel.R -gt 15 -or $pixel.G -gt 15 -or $pixel.B -gt 15) {
          $nonBlackCount += 1
        }
      }
    }

    $mean = if ($sampleCount -gt 0) { $sum / $sampleCount } else { 0 }
    $variance = if ($sampleCount -gt 0) { ($sumSquares / $sampleCount) - ($mean * $mean) } else { 0 }
    if ($variance -lt 0) {
      $variance = 0
    }

    return [pscustomobject]@{
      width = $bitmap.Width
      height = $bitmap.Height
      sampleCount = $sampleCount
      nonBlackRatio = if ($sampleCount -gt 0) { $nonBlackCount / $sampleCount } else { 0 }
      grayMean = [Math]::Round($mean, 3)
      grayVariance = [Math]::Round($variance, 3)
      minGray = $minGray
      maxGray = $maxGray
      mostlyBlack = $sampleCount -eq 0 -or ($nonBlackCount / [Math]::Max(1, $sampleCount)) -lt $MinimumNonBlackRatio
      nearUniform = $variance -lt $MinimumGrayVariance
    }
  } finally {
    $bitmap.Dispose()
  }
}

function New-CaptureManifestEntry([string]$Path, [string]$Label, $CropBox, $Analysis) {
  $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $Path
  $image = [System.Drawing.Image]::FromFile($Path)
  try {
    return [pscustomobject]@{
      filename = Split-Path -Leaf $Path
      label = $Label
      width = $image.Width
      height = $image.Height
      crop = $CropBox
      sha256 = $hash.Hash.ToLowerInvariant()
      analysis = $Analysis
      capturedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
  } finally {
    $image.Dispose()
  }
}

function Assert-KmlIntegrity([string]$KmlPath) {
  $text = Get-Content -LiteralPath $KmlPath -Raw
  $styleCount = ([regex]::Matches($text, "<Style\b")).Count
  $styleUrlCount = ([regex]::Matches($text, "<styleUrl>")).Count
  $hasExtendedData = $text.Contains("<ExtendedData>")
  $hasLookAt = $text.Contains("<LookAt>")
  $hasRemoteIconHref = [regex]::IsMatch($text, "<href>\s*https?://", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $hasCplayoutFeatureType = $text.Contains("cplayoutFeatureType")
  $hasKnownMapFeature = $text.Contains("Renamed Pipeline A")

  return [pscustomobject]@{
    styleCount = $styleCount
    styleUrlCount = $styleUrlCount
    hasExtendedData = $hasExtendedData
    hasLookAt = $hasLookAt
    hasRemoteIconHref = $hasRemoteIconHref
    hasCplayoutFeatureType = $hasCplayoutFeatureType
    hasKnownMapFeature = $hasKnownMapFeature
    passed = $styleCount -gt 0 -and $styleUrlCount -gt 0 -and $hasExtendedData -and $hasLookAt -and $hasCplayoutFeatureType -and $hasKnownMapFeature -and -not $hasRemoteIconHref
  }
}

function Invoke-ProofFixtureGenerator([string]$RepoRoot, [string]$OutputPath) {
  $generatorPath = Join-Path $OutputPath "generate-cplayout-google-earth-proof.ts"
  $kmlPath = Join-Path $OutputPath "cplayout-google-earth-visual-fidelity.kml"
  $kmzPath = Join-Path $OutputPath "cplayout-google-earth-visual-fidelity.kmz"
  $metadataPath = Join-Path $OutputPath "generated-fixture.json"

  @'
import { writeFileSync } from "node:fs";

import {
  exportProjectGoogleEarthKml,
  projectXyToLonLat,
  sampleProject,
  type PivotProject,
  type XY,
} from "@cplayout/core";
import { createGoogleEarthKmz } from "@cplayout/project-store";

const [kmlPath, kmzPath, metadataPath] = process.argv.slice(2);
if (!kmlPath || !kmzPath || !metadataPath) {
  throw new Error("Expected KML, KMZ, and metadata output paths.");
}

const proofProject: PivotProject = {
  ...sampleProject,
  mapFeatures: [
    ...(sampleProject.mapFeatures ?? []),
    {
      id: "pipeline-a",
      name: "Renamed Pipeline A",
      kind: "underground_pipeline",
      geometry: { type: "LineString", vertices: [sampleProject.waterSource, sampleProject.pivotCenter] },
      confidence: "imagery_digitized",
      notes: "Styled proof fixture line for Google Earth visual fidelity.",
    },
    {
      id: "power-line-a",
      name: "Proof Power Line A",
      kind: "power_line",
      geometry: { type: "LineString", vertices: [sampleProject.powerSource, sampleProject.pivotCenter] },
      confidence: "imagery_digitized",
      notes: "Styled proof fixture line for Google Earth visual fidelity.",
    },
    {
      id: "pump-location-a",
      name: "Proof Pump Location A",
      kind: "pump_location",
      geometry: { type: "Point", point: sampleProject.waterSource },
      confidence: "rtk_fixed",
      notes: "Styled proof fixture point for Google Earth visual fidelity.",
    },
  ],
};

function allProjectPoints(project: PivotProject): XY[] {
  const points: XY[] = [
    ...project.fieldBoundary,
    project.pivotCenter,
    project.waterSource,
    project.powerSource,
    ...project.surveyPoints.map((point) => point.projected),
  ];
  for (const obstacle of project.obstacles) points.push(...obstacle.polygon);
  for (const feature of project.mapFeatures ?? []) {
    if (feature.geometry.type === "Point") {
      points.push(feature.geometry.point);
    } else {
      points.push(...feature.geometry.vertices);
    }
  }
  return points;
}

function addDocumentLookAt(kml: string, project: PivotProject): string {
  const lonLats = allProjectPoints(project).map((point) => projectXyToLonLat(point, project.projectCrs));
  const longitudes = lonLats.map((point) => point.longitude);
  const latitudes = lonLats.map((point) => point.latitude);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const longitude = (minLongitude + maxLongitude) / 2;
  const latitude = (minLatitude + maxLatitude) / 2;
  const longitudeMeters = Math.abs(maxLongitude - minLongitude) * 111320 * Math.cos(latitude * Math.PI / 180);
  const latitudeMeters = Math.abs(maxLatitude - minLatitude) * 110540;
  const range = Math.max(1200, Math.max(longitudeMeters, latitudeMeters) * 3.5);
  const lookAt = `<LookAt><longitude>${longitude.toFixed(8)}</longitude><latitude>${latitude.toFixed(8)}</latitude><altitude>0</altitude><heading>0</heading><tilt>0</tilt><range>${range.toFixed(2)}</range><altitudeMode>clampToGround</altitudeMode></LookAt>`;
  return kml.replace("<Document>", `<Document>${lookAt}`);
}

const exported = exportProjectGoogleEarthKml(proofProject);
const kml = addDocumentLookAt(exported.kml, proofProject);
writeFileSync(kmlPath, kml, "utf8");
writeFileSync(kmzPath, Buffer.from(createGoogleEarthKmz(kml)));
writeFileSync(metadataPath, JSON.stringify({
  projectId: proofProject.id,
  projectName: proofProject.name,
  projectCrs: proofProject.projectCrs,
  exportedFeatureCount: exported.exportedFeatureCount,
  warnings: exported.warnings,
  generatedAt: new Date().toISOString(),
}, null, 2));
'@ | Set-Content -LiteralPath $generatorPath -Encoding UTF8

  $npmExitCode = 0
  Push-Location $RepoRoot
  try {
    & npm exec tsx -- $generatorPath $kmlPath $kmzPath $metadataPath
    $npmExitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }

  if ($npmExitCode -ne 0) {
    $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
    if (-not $wsl) {
      throw "Proof fixture generation failed with exit code $npmExitCode."
    }
    $wslRepoRoot = Quote-BashPath (Convert-ToWslPath $RepoRoot)
    $wslGeneratorPath = Quote-BashPath (Convert-ToWslPath $generatorPath)
    $wslKmlPath = Quote-BashPath (Convert-ToWslPath $kmlPath)
    $wslKmzPath = Quote-BashPath (Convert-ToWslPath $kmzPath)
    $wslMetadataPath = Quote-BashPath (Convert-ToWslPath $metadataPath)
    $bashCommand = "cd $wslRepoRoot && npm exec tsx -- $wslGeneratorPath $wslKmlPath $wslKmzPath $wslMetadataPath"
    & wsl.exe bash -lc $bashCommand
    if ($LASTEXITCODE -ne 0) {
      throw "Proof fixture generation failed through npm and WSL fallback. npm exit code: $npmExitCode; WSL exit code: $LASTEXITCODE."
    }
  }

  return [pscustomobject]@{
    generator = $generatorPath
    kml = $kmlPath
    kmz = $kmzPath
    metadata = $metadataPath
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $repoRoot $OutputDir
if (-not $IsLinux) {
  $outputPath = Convert-ToWindowsPath $outputPath
}
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$fixture = Invoke-ProofFixtureGenerator -RepoRoot $repoRoot -OutputPath $outputPath
$kmlIntegrity = Assert-KmlIntegrity -KmlPath $fixture.kml
$artifactPath = if ($OpenArtifact -eq "kmz") { $fixture.kmz } else { $fixture.kml }

$captures = @()
$processInfo = $null
$windowBounds = $null
$canvasPass = $false
$captureError = $null

if (-not $GenerateOnly) {
  try {
    Initialize-WindowsCaptureAssemblies
    if (-not (Test-Path -LiteralPath $GoogleEarthPath)) {
      throw "Google Earth Pro was not found at $GoogleEarthPath"
    }

    Start-Process -FilePath $GoogleEarthPath -ArgumentList @("`"$artifactPath`"") | Out-Null
    Start-Sleep -Seconds $StartupSeconds
    $process = Get-GoogleEarthProcess -Path $GoogleEarthPath
    $handle = Wait-ForMainWindow -Process $process
    [WindowApi]::ShowWindow($handle, 3) | Out-Null
    [WindowApi]::SetForegroundWindow($handle) | Out-Null
    Start-Sleep -Seconds $RenderSeconds

    $windowBounds = Get-WindowBounds -Handle $handle
    $processInfo = [pscustomobject]@{
      id = $process.Id
      processName = $process.ProcessName
      mainWindowTitle = $process.MainWindowTitle
      path = $process.Path
      startTime = if ($process.StartTime) { $process.StartTime.ToUniversalTime().ToString("o") } else { $null }
    }

    $fullPath = Join-Path $outputPath "google-earth-visual-fidelity-full-window.png"
    $fullCrop = Capture-Window -Handle $handle -Path $fullPath -Crop (New-Object System.Drawing.Rectangle 0, 0, 0, 0)
    $captures += New-CaptureManifestEntry -Path $fullPath -Label "Google Earth Pro full window after opening CPLayout styled proof fixture" -CropBox $fullCrop -Analysis $null

    $sidebarWidth = [Math]::Min(430, [Math]::Max(260, [Math]::Floor($windowBounds.width * 0.34)))
    $sidebarPath = Join-Path $outputPath "google-earth-visual-fidelity-places-sidebar.png"
    $sidebarCrop = Capture-Window -Handle $handle -Path $sidebarPath -Crop (New-Object System.Drawing.Rectangle 0, 0, $sidebarWidth, $windowBounds.height)
    $captures += New-CaptureManifestEntry -Path $sidebarPath -Label "Google Earth Pro Places/sidebar crop for loaded CPLayout proof fixture" -CropBox $sidebarCrop -Analysis (Analyze-Image -Path $sidebarPath)

    $canvasX = [Math]::Min($sidebarWidth, [Math]::Floor($windowBounds.width * 0.38))
    $canvasY = [Math]::Min(120, [Math]::Floor($windowBounds.height * 0.16))
    $canvasWidth = [Math]::Max(300, $windowBounds.width - $canvasX - 28)
    $canvasHeight = [Math]::Max(260, $windowBounds.height - $canvasY - 48)
    $canvasPath = Join-Path $outputPath "google-earth-visual-fidelity-map-canvas.png"
    $canvasCrop = Capture-Window -Handle $handle -Path $canvasPath -Crop (New-Object System.Drawing.Rectangle $canvasX, $canvasY, $canvasWidth, $canvasHeight)
    $canvasAnalysis = Analyze-Image -Path $canvasPath
    $canvasPass = -not $canvasAnalysis.mostlyBlack -and -not $canvasAnalysis.nearUniform
    $captures += New-CaptureManifestEntry -Path $canvasPath -Label "Google Earth Pro map-canvas crop for non-black visual fidelity proof" -CropBox $canvasCrop -Analysis $canvasAnalysis
  } catch {
    $captureError = $_.Exception.Message
  }
}

$artifactHashes = [pscustomobject]@{
  kml = (Get-FileHash -Algorithm SHA256 -LiteralPath $fixture.kml).Hash.ToLowerInvariant()
  kmz = (Get-FileHash -Algorithm SHA256 -LiteralPath $fixture.kmz).Hash.ToLowerInvariant()
}

$overlayConfirmed = [bool]$ConfirmOverlayVisible
$proofPassed = [bool]($kmlIntegrity.passed -and $canvasPass -and $overlayConfirmed)
$status = if ($GenerateOnly) {
  "generated_only"
} elseif ($proofPassed) {
  "passed"
} elseif ($captureError) {
  "blocked"
} elseif (-not $canvasPass) {
  "failed_canvas_pixel_gate"
} else {
  "manual_overlay_review_required"
}

$manifest = [pscustomobject]@{
  schemaVersion = "cplayout-google-earth-visual-fidelity-proof-v1"
  status = $status
  proofPassed = $proofPassed
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  repoRoot = Convert-ToRepoRelativePath -Path $repoRoot -RepoRoot $repoRoot
  outputDir = Convert-ToRepoRelativePath -Path $outputPath -RepoRoot $repoRoot
  googleEarth = [pscustomobject]@{
    requestedPath = $GoogleEarthPath
    openedArtifact = $OpenArtifact
    startupSeconds = $StartupSeconds
    renderSeconds = $RenderSeconds
    process = $processInfo
    windowBounds = $windowBounds
    captureError = $captureError
  }
  thresholds = [pscustomobject]@{
    minimumNonBlackRatio = $MinimumNonBlackRatio
    minimumGrayVariance = $MinimumGrayVariance
  }
  artifacts = [pscustomobject]@{
    kml = Convert-ToRepoRelativePath -Path $fixture.kml -RepoRoot $repoRoot
    kmz = Convert-ToRepoRelativePath -Path $fixture.kmz -RepoRoot $repoRoot
    generator = Convert-ToRepoRelativePath -Path $fixture.generator -RepoRoot $repoRoot
    metadata = Convert-ToRepoRelativePath -Path $fixture.metadata -RepoRoot $repoRoot
    sha256 = $artifactHashes
    kmlIntegrity = $kmlIntegrity
  }
  captures = $captures
  manualReview = [pscustomobject]@{
    overlayVisibleConfirmed = $overlayConfirmed
    requirement = "Set -ConfirmOverlayVisible only after the map-canvas screenshot visibly includes CPLayout styled geometry, not just a non-black globe."
  }
  nonGoals = @(
    "Does not prove Android or iOS persistence.",
    "Does not prove native MapLibre, raw PMTiles, or raw MBTiles rendering.",
    "Does not change canonical projected XY geometry, project schemas, persistence, or archive semantics."
  )
}

$manifestPath = Join-Path $outputPath "visual-fidelity-manifest.json"
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host "Wrote Google Earth visual fidelity manifest: $manifestPath"
Write-Host "Status: $status"

if ($RequireProofPass -and -not $proofPassed) {
  throw "Google Earth visual fidelity proof did not pass. Manifest status: $status"
}
