export function formatResponse(output = '') {
  if (!output.trim()) return '调用完成，响应为空';
  try { return JSON.stringify(JSON.parse(output), null, 2); }
  catch { return output; }
}
export function filterRows(rows, query = '') {
  const needle = query.trim().toLowerCase();
  return needle ? rows.filter(row => JSON.stringify(row).toLowerCase().includes(needle)) : rows;
}
