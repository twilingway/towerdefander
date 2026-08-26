param(
  [Parameter(Mandatory = $true)][string]$TextPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$text = [System.IO.File]::ReadAllText($TextPath, [System.Text.Encoding]::UTF8)
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voice.SelectVoice('Microsoft Irina Desktop')
  $voice.Rate = 2
  $voice.SetOutputToWaveFile($OutputPath)
  $voice.Speak($text)
} catch {
  throw "Local Microsoft Irina Desktop ru-RU voice could not be used: $($_.Exception.Message)"
}
finally {
  $voice.Dispose()
}
