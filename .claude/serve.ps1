# Async statický HTTP server pro MFX-FLOW preview
# Použití: powershell -ExecutionPolicy Bypass -File serve.ps1 [port]

param([int]$Port = 5173)

$ErrorActionPreference = 'Continue'
$root = (Resolve-Path "$PSScriptRoot\..").Path

Add-Type -AssemblyName System.Web

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.mjs'  = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.webp' = 'image/webp'
  '.ico'  = 'image/x-icon'
  '.woff' = 'font/woff'
  '.woff2'= 'font/woff2'
  '.ttf'  = 'font/ttf'
  '.txt'  = 'text/plain; charset=utf-8'
  '.map'  = 'application/json'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$Port/"

# Runspace pool pro async zpracování requestů
$pool = [RunspaceFactory]::CreateRunspacePool(1, 16)
$pool.Open()

$handler = {
  param($ctx, $root, $mime)
  try {
    $req = $ctx.Request
    $res = $ctx.Response

    $rel = [System.Web.HttpUtility]::UrlDecode($req.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
    $path = Join-Path $root $rel

    if ((Test-Path $path -PathType Container)) {
      $path = Join-Path $path 'index.html'
    }

    if (Test-Path $path -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $res.StatusCode = 200
      $res.ContentType = $type
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [Text.Encoding]::UTF8.GetBytes("404 Not Found: $rel")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    $res.OutputStream.Close()
  } catch {
    try { $ctx.Response.StatusCode = 500; $ctx.Response.OutputStream.Close() } catch {}
  }
}

$jobs = @()

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $ps = [PowerShell]::Create()
    $ps.RunspacePool = $pool
    [void]$ps.AddScript($handler).AddArgument($ctx).AddArgument($root).AddArgument($mime)
    $async = $ps.BeginInvoke()
    $jobs += [PSCustomObject]@{ PS = $ps; Async = $async }

    # Cleanup hotových jobů
    $jobs = $jobs | Where-Object {
      if ($_.Async.IsCompleted) {
        $_.PS.EndInvoke($_.Async) | Out-Null
        $_.PS.Dispose()
        $false
      } else { $true }
    }
  } catch {
    Write-Host "Listener error: $_"
  }
}
