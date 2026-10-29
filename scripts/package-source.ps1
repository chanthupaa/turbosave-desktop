$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Push-Location -LiteralPath $projectRoot
try {
    New-Item -ItemType Directory -Path 'artifacts' -Force | Out-Null
    $sourcePaths = @('src','ui','scripts','tests','build-resources','.github','docs','package.json','package-lock.json','engines.lock.json','LICENSE','README.md','CHANGELOG.md','SECURITY.md','SECURITY_VALIDATION.md','FOLDER_FIX_VALIDATION.md','THIRD_PARTY_NOTICES.md','CONTRIBUTING.md','BUILD_GUIDE.md','VALIDATION.md','VALIDATION-0.8.md','SIGNING.md','RELEASE_READINESS.md','DEPENDENCY_SOURCES.md','BETA_RELEASE.md','MARKETING.md','.gitignore')
    $version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
    $archive = "artifacts/TurboSave-Desktop-$version-source.zip"
    Compress-Archive -LiteralPath $sourcePaths -DestinationPath $archive -Force
    Get-FileHash -LiteralPath $archive -Algorithm SHA256
}
finally {Pop-Location}
