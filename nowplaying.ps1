# Prints the current Windows media session as one line of compact JSON:
# {"title":...,"artist":...,"app":...,"status":...}, or {} when there is none.
# Needs Windows PowerShell 5.1 (powershell.exe): the WinRT projection is gone in .NET 5+.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1

    function Await($op, [Type]$type) {
        $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
        [void]$task.Wait(5000)
        $task.Result
    }

    $mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
    $propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
    $mgr = Await ($mgrType::RequestAsync()) $mgrType

    # Prefer a session that is actually playing; fall back to Windows' "current" one.
    $sessions = @($mgr.GetSessions())
    $session = $sessions | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq 'Playing' } | Select-Object -First 1
    if (-not $session) { $session = $mgr.GetCurrentSession() }
    if (-not $session) { '{}'; exit 0 }

    $props = Await ($session.TryGetMediaPropertiesAsync()) $propsType
    if (-not $props -or [string]::IsNullOrWhiteSpace($props.Title)) { '{}'; exit 0 }

    [ordered]@{
        title  = $props.Title
        artist = $props.Artist
        app    = $session.SourceAppUserModelId
        status = $session.GetPlaybackInfo().PlaybackStatus.ToString().ToLower()
    } | ConvertTo-Json -Compress
}
catch {
    '{}'
}
