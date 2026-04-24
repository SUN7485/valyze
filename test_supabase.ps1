$url = "https://dnhtowmzrluqtlivdqqj.supabase.co/rest/v1/reports?select=id&limit=1"
$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuaHRvd216cmx1cXRsaXZkcXFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzg5NDUsImV4cCI6MjA5MTg1NDk0NX0.ALa47kw9C5D8sK3IcBiZB0flIOpW-vaXjr2bxaqSOIQ"
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuaHRvd216cmx1cXRsaXZkcXFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzg5NDUsImV4cCI6MjA5MTg1NDk0NX0.ALa47kw9C5D8sK3IcBiZB0flIOpW-vaXjr2bxaqSOIQ"
}
try {
    $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    $response | ConvertTo-Json | Out-File "d:\valyez final\supabase_test.txt"
} catch {
    $_.Exception.Message | Out-File "d:\valyez final\supabase_test.txt"
    $_.ErrorDetails.Message | Out-File "d:\valyez final\supabase_test.txt" -Append
}
