// SPDX-License-Identifier: GPL-3.0-only
exports.default=async context=>{
  const {verifyEngineManifest}=await import('./engine-manifest.mjs');
  await verifyEngineManifest(context.packager.projectDir);
};
