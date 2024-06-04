$version = $env:INPUT_CUDA_VERSION # 12.5 or 11.8

Write-Output "Selected CUDA version: $version"

$src = "cuda"
$dst = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\$version"

$file = "cuda.exe"

if ($version -eq "v12.5") {
    $downloadUrl = "https://developer.download.nvidia.com/compute/cuda/12.5.0/local_installers/cuda_12.5.0_555.85_windows.exe"
} elseif ($version -eq "v11.8") {
    $downloadUrl = "https://developer.download.nvidia.com/compute/cuda/11.8.0/local_installers/cuda_11.8.0_522.06_windows.exe"
} else {
    Write-Output "Unsupported CUDA version specified"
    exit 1
}

# Download cuda
Write-Output "Downloading CUDA from: $downloadUrl"
if (-not (Test-Path -Path $file)) {
    Write-Output "Downloading CUDA installer..."
    # If the file does not exist, download it
    & "C:\msys64\usr\bin\wget" $downloadUrl -O $file -q
}

# Extract cuda
if (-not (Test-Path -Path $src -Type Container)) {
    # Extract CUDA using 7-Zip
    Write-Output "Extracting CUDA using 7-Zip..."
    mkdir "$src"
    & 'C:\Program Files\7-Zip\7z' x $file -o"$src"
}

# Create destination directory if it doesn't exist
if (-Not (Test-Path -Path $dst)) {
    Write-Output "Creating destination directory: $dst"
    New-Item -Path $dst -ItemType Directory
}

# Get directories to process from the source path
$directories = Get-ChildItem -Directory -Path $src
$whitelist = @("CUDA_Toolkit_Release_Notes.txt", "DOCS", "EULA.txt", "LICENSE", "README", "version.json")

foreach ($dir in $directories) {
    # Get all subdirectories and files in the current directory
    $items = Get-ChildItem -Path (Join-Path $src $dir.Name)

    foreach ($item in $items) {
        if ($item.PSIsContainer) {
            # If the item is a directory, copy its contents
            Write-Output "Copying contents of directory $($item.FullName) to $dst"
            Copy-Item -Path "$($item.FullName)\*" -Destination $dst -Recurse -Force
        } else {
            if ($whitelist -contains $item.Name) {
                Write-Output "Copying file $($item.FullName) to $dst"
                Copy-Item -Path $item.FullName -Destination $dst -Force
            }
        }
    }
}

# add to github env
Write-Output "Setting environment variables for GitHub Actions..."
Write-Output "CUDA_PATH=$dst" >> $env:GITHUB_ENV
Write-Output "CUDA_VERSION=$version" >> $env:GITHUB_ENV
Write-Output "Setup completed."
