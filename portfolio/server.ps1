# Lightweight Windows PowerShell HTTP Server with CORS & MIME support
$port = 8000
$url = "http://localhost:$port/"
$root = $PSScriptRoot

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)

try {
    $listener.Start()
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Local Portfolio 3D Server Running" -ForegroundColor Green
    Write-Host " URL: http://localhost:$port/portfolio.html" -ForegroundColor Yellow
    Write-Host " Press Ctrl+C in this window to stop the server." -ForegroundColor Gray
    Write-Host "========================================================" -ForegroundColor Cyan
    
    # Open browser automatically
    Start-Process "http://localhost:$port/portfolio.html"

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $localPath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($localPath)) {
            $localPath = "portfolio.html"
        }
        $localPath = [System.Uri]::UnescapeDataString($localPath)
        $filePath = Join-Path $root $localPath

        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".jpeg" { "image/jpeg" }
                ".exr"  { "image/x-exr" }
                ".fbx"  { "application/octet-stream" }
                ".obj"  { "text/plain" }
                ".mp4"  { "video/mp4" }
                default { "application/octet-stream" }
            }
            $response.ContentType = $mime
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 - File Not Found: $localPath")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.OutputStream.Close()
    }
} catch {
    Write-Host "Server stopped or encountered an error: $_" -ForegroundColor Red
} finally {
    $listener.Stop()
    $listener.Close()
}
