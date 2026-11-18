try {
  const r = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/_health/ready`, { signal: AbortSignal.timeout(4000) })
  process.exitCode = r.ok && (await r.json()).ok === true ? 0 : 1
} catch { process.exitCode = 1 }
