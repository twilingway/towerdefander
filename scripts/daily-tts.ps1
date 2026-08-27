param(
  [Parameter(Mandatory = $true)][string]$SsmlPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$ssml = [System.IO.File]::ReadAllText($SsmlPath, [System.Text.Encoding]::UTF8)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$synthesizer = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::new()

function Wait-WinRtOperation([object]$Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and
      $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1
    } |
    Select-Object -First 1
  return $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation)).GetAwaiter().GetResult()
}

try {
  $maleRussianVoice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices |
    Where-Object { $_.Language -eq 'ru-RU' -and $_.Gender.ToString() -eq 'Male' } |
    Select-Object -First 1
  if ($null -eq $maleRussianVoice) {
    throw 'No Russian male Windows voice is installed. Install a ru-RU male voice, then run the report again.'
  }
  $synthesizer.Voice = $maleRussianVoice
  $operation = $synthesizer.SynthesizeSsmlToStreamAsync($ssml)
  $stream = Wait-WinRtOperation $operation ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  try {
    $reader = [Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
    try {
      $null = Wait-WinRtOperation ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
      $bytes = New-Object byte[] $stream.Size
      $reader.ReadBytes($bytes)
      [System.IO.File]::WriteAllBytes($OutputPath, $bytes)
    }
    finally {
      $reader.Dispose()
    }
  }
  finally {
    $stream.Dispose()
  }
} catch {
  throw "Russian male narration failed: $($_.Exception.Message)"
}
finally {
  $synthesizer.Dispose()
}
