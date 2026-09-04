param(
  [ValidateSet("cuda", "cpu")]
  [string]$Compute = "cuda",
  [string]$OutputDirectory = "extraResources/demucs-runtime",
  [string]$PythonVersion = "3.11.9"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$target = Join-Path $projectRoot $OutputDirectory
$buildTemp = Join-Path $env:TEMP "y18-demucs-runtime-$PID"
$pythonZip = Join-Path $buildTemp "python.zip"
$getPip = Join-Path $buildTemp "get-pip.py"
$pythonUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"

if (
  (Test-Path -LiteralPath $target) -and
  (Get-ChildItem -LiteralPath $target -Force | Where-Object { $_.Name -ne ".gitkeep" })
) {
  throw "Runtime directory already exists: $target"
}

New-Item -ItemType Directory -Force -Path $target, $buildTemp | Out-Null

try {
  Invoke-WebRequest -Uri $pythonUrl -OutFile $pythonZip
  Expand-Archive -LiteralPath $pythonZip -DestinationPath $target -Force

  $pthFile = Get-ChildItem -LiteralPath $target -Filter "python*._pth" | Select-Object -First 1
  if (-not $pthFile) { throw "Python embedded path configuration was not found" }
  (Get-Content -LiteralPath $pthFile.FullName) -replace '^#import site$', 'import site' |
    Set-Content -LiteralPath $pthFile.FullName -Encoding ASCII

  Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $getPip
  $runtimePython = Join-Path $target "python.exe"
  & $runtimePython $getPip "pip==24.3.1"
  if ($LASTEXITCODE -ne 0) { throw "Unable to bootstrap pip" }

  $torchIndex = if ($Compute -eq "cuda") {
    "https://download.pytorch.org/whl/cu121"
  } else {
    "https://download.pytorch.org/whl/cpu"
  }
  & $runtimePython -m pip install "torch==2.1.2" "torchaudio==2.1.2" --index-url $torchIndex
  if ($LASTEXITCODE -ne 0) { throw "Unable to install Torch runtime" }

  & $runtimePython -m pip install "demucs==4.0.1" "numpy==1.26.4" "soundfile==0.12.1"
  if ($LASTEXITCODE -ne 0) { throw "Unable to install Demucs" }

  & $runtimePython -c "import demucs,torch,torchaudio,soundfile; cuda=torch.cuda.is_available(); torch.zeros(1,device='cuda') if cuda else None; print('Demucs',getattr(demucs,'__version__','4.0.1')); print('Torch',torch.__version__); print('CUDA',cuda); print(torch.cuda.get_device_name(0) if cuda else 'CPU'); print('Audio backends', torchaudio.list_audio_backends())"
  if ($LASTEXITCODE -ne 0) { throw "Demucs runtime verification failed" }

  Write-Host "Portable Demucs runtime ready at $target"
} finally {
  if (Test-Path -LiteralPath $buildTemp) {
    Remove-Item -LiteralPath $buildTemp -Recurse -Force
  }
}
