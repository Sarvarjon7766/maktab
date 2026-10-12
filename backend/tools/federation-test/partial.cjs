(async () => {
  const t = (await (await fetch('http://localhost:5070/api/user/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'viloyat', password: 'Region-test-123' }) })).json()).token
  for (let i = 1; i <= 4; i++) {
    const s = Date.now()
    const r = await fetch('http://localhost:5070/api/monitor/overview?date=2026-10-0' + i, { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    console.log('so\'rov', i, r.status, 'maktablar', j.schools?.length, 'partial', JSON.stringify(j.partial), Date.now() - s, 'ms')
  }
})()
