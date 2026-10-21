// Runs before first paint (no flash of the wrong theme). Kept as a plain script so CSP can stay script-src 'self'.
try {
  const saved = localStorage.getItem('yimm-theme')
  if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved)
} catch {
  // storage unavailable: follow the system theme
}
