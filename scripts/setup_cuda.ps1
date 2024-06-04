# Inspired from https://github.com/NVlabs/tiny-cuda-nn/tree/master/dependencies/cuda-cmake-github-actions

# Get the cuda version from the environment as env:cuda.
# 12.5 or 11.8
# $CUDA_VERSION_FULL = "12.5"
$CUDA_VERSION_FULL = $env:INPUT_CUDA_VERSION

# Make sure CUDA_VERSION_FULL is set and valid, otherwise error.
# Validate CUDA version, extracting components via regex
$cuda_ver_matched = $CUDA_VERSION_FULL -match "^(?<major>[1-9][0-9]*)\.(?<minor>[0-9]+)\.(?<patch>[0-9]+)$"
if(-not $cuda_ver_matched){
    Write-Output "Invalid CUDA version specified, <major>.<minor>.<patch> required. '$CUDA_VERSION_FULL'."
    exit 1
}
$CUDA_MAJOR=$Matches.major
$CUDA_MINOR=$Matches.minor
$CUDA_PATCH=$Matches.patch

Write-Output "Selected CUDA version: $CUDA_VERSION_FULL"

# Construct download URL
if ($CUDA_VERSION_FULL -eq "12.5.0") {
    $downloadUrl = "https://developer.download.nvidia.com/compute/cuda/12.5.0/local_installers/cuda_12.5.0_555.85_windows.exe"
} elseif ($CUDA_VERSION_FULL -eq "11.8.0") {
    $downloadUrl = "https://developer.download.nvidia.com/compute/cuda/11.8.0/local_installers/cuda_11.8.0_522.06_windows.exe"
} else {
    Write-Output "Unsupported CUDA version specified"
    exit 1
}

# Download cuda
$installerPath = "cuda.exe"
Write-Output "Downloading CUDA from: $downloadUrl"
if (-not (Test-Path -Path $installerPath)) {
    Write-Output "Downloading CUDA installer..."
    # If the file does not exist, download it
    & "C:\msys64\usr\bin\wget" $downloadUrl -O $installerPath -q
}

$CUDA_PACKAGES_IN = @(
    "nvcc";
    "visual_studio_integration";
    "cublas";
    "cublas_dev";
    "curand_dev";
    "nvrtc_dev";
    "cudart";
)
Foreach ($package in $CUDA_PACKAGES_IN) {
    # Make sure the correct package name is used for nvcc.
    if($package -eq "nvcc" -and [version]$CUDA_VERSION_FULL -lt [version]"9.1"){
        $package="compiler"
    } elseif($package -eq "compiler" -and [version]$CUDA_VERSION_FULL -ge [version]"9.1") {
        $package="nvcc"
    }
    $CUDA_PACKAGES += " $($package)_$($CUDA_MAJOR).$($CUDA_MINOR)"

}

Write-Output "Installing cuda with command:"
Write-Output "$installerPath -s $($CUDA_PACKAGES)"
Start-Process -Wait -FilePath "$installerPath" -ArgumentList "-s $($CUDA_PACKAGES)"

$cudaPath = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v$($CUDA_MAJOR).$($CUDA_MINOR)"

Write-Output "Adding Github env"
Write-Output "CUDA_PATH=$cudaPath"
Write-Output "CUDA_VERSION=$($CUDA_MAJOR).$($CUDA_MINOR)"

Write-Output "CUDA_PATH=$cudaPath" >> $env:GITHUB_ENV
Write-Output "CUDA_PATH_$($CUDA_MAJOR)_$($CUDA_MINOR)=$cudaPath" >> $env:GITHUB_ENV
Write-Output "CUDA_PATH_VX_Y=CUDA_PATH_V$($CUDA_MAJOR)_$($CUDA_MINOR)" >> $env:GITHUB_ENV
Write-Output "CUDA_VERSION=$($CUDA_MAJOR).$($CUDA_MINOR)" >> $env:GITHUB_ENV

Write-Output "Setup completed."