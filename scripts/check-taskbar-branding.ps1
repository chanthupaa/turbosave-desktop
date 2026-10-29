param([int]$TargetProcessId = 0)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
namespace TurboSaveBrandingProbe {
 [StructLayout(LayoutKind.Sequential)] public struct PropertyKey { public Guid fmtid; public uint pid; }
 [StructLayout(LayoutKind.Explicit,Size=24)] public struct Variant { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr pointer; }
 [ComImport,Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 public interface PropertyStore {
  [PreserveSig] int GetCount(out uint count);
  [PreserveSig] int GetAt(uint index,out PropertyKey key);
  [PreserveSig] int GetValue(ref PropertyKey key,out Variant value);
  [PreserveSig] int SetValue(ref PropertyKey key,ref Variant value);
  [PreserveSig] int Commit();
 }
 public static class Probe {
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr hwnd,ref Guid iid,[MarshalAs(UnmanagedType.Interface)] out PropertyStore store);
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref Variant value);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hwnd,uint message,IntPtr wParam,IntPtr lParam);
  public static string Read(IntPtr hwnd,uint id) {
   Guid iid=new Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"); PropertyStore store;
   Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(hwnd,ref iid,out store));
   try { var key=new PropertyKey{fmtid=new Guid("9f4c2855-9f79-4b39-a8d0-e1d42de1d5f3"),pid=id}; Variant value;
    Marshal.ThrowExceptionForHR(store.GetValue(ref key,out value));
    try{return value.vt==31?Marshal.PtrToStringUni(value.pointer):null;}finally{PropVariantClear(ref value);}
   }finally{Marshal.ReleaseComObject(store);}
  }
 }
}
'@
if ($TargetProcessId) { $taskProcess = Get-Process -Id $TargetProcessId } else {
    $taskProcesses = @(Get-Process -Name 'TurboSave Desktop' | Where-Object MainWindowHandle -NE 0)
    if ($taskProcesses.Count -ne 1) { throw 'Expected exactly one visible TurboSave window. Supply TargetProcessId.' }
    $taskProcess = $taskProcesses[0]
}
if (-not $taskProcess.MainWindowHandle) { throw 'The target has no visible window.' }
$taskHandle = $taskProcess.MainWindowHandle
$taskOutput = Join-Path (Split-Path -Parent $PSScriptRoot) 'artifacts\taskbar-branding'
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
foreach ($taskKind in @(@{Name='small';Value=0},@{Name='big';Value=1})) {
    $taskIconHandle = [TurboSaveBrandingProbe.Probe]::SendMessage($taskHandle,127,[IntPtr]$taskKind.Value,[IntPtr]::Zero)
    if ($taskIconHandle -ne [IntPtr]::Zero) {
        $taskBitmap = [System.Drawing.Icon]::FromHandle($taskIconHandle).ToBitmap()
        try { $taskBitmap.Save((Join-Path $taskOutput ('window-'+$taskKind.Name+'.png')),[System.Drawing.Imaging.ImageFormat]::Png) } finally { $taskBitmap.Dispose() }
    }
}
$taskReport = [ordered]@{
    processId=$taskProcess.Id
    executable=$taskProcess.Path
    appId=[TurboSaveBrandingProbe.Probe]::Read($taskHandle,5)
    relaunchCommand=[TurboSaveBrandingProbe.Probe]::Read($taskHandle,2)
    taskbarIconResource=[TurboSaveBrandingProbe.Probe]::Read($taskHandle,3)
    relaunchDisplayName=[TurboSaveBrandingProbe.Probe]::Read($taskHandle,4)
}
$taskReport | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskOutput 'windows-properties.json') -Encoding UTF8
$taskReport | ConvertTo-Json
