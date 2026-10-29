# Signing a Windows release

The regular development build remains unsigned. `scripts/build-signed.mjs` is a separate release build that requires signing credentials and sets electron-builder's `forceCodeSigning` option. It must fail rather than silently produce an unsigned release. Signing is not completed until a real certificate/service is configured and `Get-AuthenticodeSignature` verifies the delivered installer and app.

Obtain a Windows code-signing certificate from a trusted certificate authority, or configure a supported signing service such as Microsoft Artifact Signing. The publisher identity must be yours; a self-signed development certificate does not establish public publisher trust. Signing alone does not guarantee the absence of SmartScreen warnings.

For a compatible exportable certificate, enter its path and password only in your local PowerShell terminal:

```powershell
$env:CSC_LINK = Read-Host 'Path to your signing certificate file'
$certificatePassword = Read-Host 'Certificate password' -AsSecureString
$env:CSC_KEY_PASSWORD = [System.Net.NetworkCredential]::new('', $certificatePassword).Password
try {
    node scripts/build-signed.mjs
}
finally {
    Remove-Item Env:CSC_LINK, Env:CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
    $certificatePassword = $null
}
```

Do not put certificates, passwords or signing tokens in Git, chat, build descriptions or source archives. Hardware-token and cloud-signing certificates may require the issuer's additional setup rather than an exportable file. This project has not been supplied with a signing certificate or service account.

Reference: https://www.electron.build/code-signing-win and https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation.

## Authenticated desktop release metadata

This is separate from Authenticode. `build-resources/update-trust.json` deliberately contains no fake/default signing key. Desktop release checks fail closed until the maintainer provisions one. Engine repair continues to use official publishers' HTTPS endpoints and checksums.

1. In a private terminal, set `TURBOSAVE_RELEASE_KEY_DIRECTORY` to a **new directory outside the repository**, and `TURBOSAVE_RELEASE_KEY_ID` to a public identifier such as `desktop-2026`. Run `npm run release:keygen`. On Windows the script restricts the directory ACL to your user and SYSTEM before writing a private key.
2. Securely back up `release-private.pem`. Never commit, upload or paste it. Copy only the public JSON record from `public-key.json` into the `keys` array of `build-resources/update-trust.json`. Review and rebuild. The public key must reach users in a trusted installer before it can authenticate later releases.
3. Build and validate the exact installer/portable files (use `npm run build:signed` when Authenticode credentials are configured). Set `TURBOSAVE_RELEASE_PRIVATE_KEY` to the private file's absolute path, `TURBOSAVE_RELEASE_KEY_ID` to its ID, and `TURBOSAVE_RELEASE_REPOSITORY` to the exact `owner/repository`. Run `npm run release:sign-metadata`.
4. Publish `turbosave-release.json` and `turbosave-release.sig.json` beside the exact installer and portable assets. GitHub's asset size, SHA-256 digest and URL must match the signed records. Metadata is signed for 30 days; renew it before expiry even if no new app is released.
5. Rotate keys by first shipping a trusted build containing both public keys. Never obtain replacement trust keys from the same unsigned update response. Keep old private keys offline or retire them after the migration window.

A signed metadata file authenticates hashes; it does not itself Authenticode-sign the installer. TurboSave continues to open a verified release page and never silently executes an installer. Empty keys, missing/altered signatures, expired metadata and mismatched assets fail closed.
