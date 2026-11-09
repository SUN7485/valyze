# Quick connectivity probe. Set SUPABASE_URL and SUPABASE_ANON_KEY in the environment first.
$url = "$env:SUPABASE_URL/rest/v1/reports?select=id&limit=1"
$headers = @{
    "apikey" = $env:SUPABASE_ANON_KEY
    "Authorization" = "Bearer $env:SUPABASE_ANON_KEY"
}
try {
    $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    $response | ConvertTo-Json
} catch {
    $_.Exception.Message
    $_.ErrorDetails.Message
}
